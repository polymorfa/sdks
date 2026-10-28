// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PolymorfaClient,
  resetPermissionWarnings,
  type BrowserGroup,
  type ContactDirectorySource,
  type DirectoryContact,
  type GroupSource,
  type InboxConversation,
  type InboxDataSource,
  type PolymorfaPermission,
} from "@polymorfa/ui-kit/internal";
import {
  PolymorfaContactListElement,
  PolymorfaGroupDetailsElement,
  PolymorfaInboxElement,
  PolymorfaNewChatElement,
  defineUiKit,
} from "../../src/web-components/index.js";
import { resetDefineUiKit } from "../../src/web-components/dropin.js";

const contacts: DirectoryContact[] = [
  { id: "1", name: "Ada Lovelace", phoneNumber: "+15550001" },
  { id: "2", name: "Grace Hopper", phoneNumber: "+15550002" },
];

function contactSource(): ContactDirectorySource {
  return { list: vi.fn(async () => contacts), lookup: vi.fn(async () => null) };
}

function groupSource(): GroupSource {
  const group: BrowserGroup = {
    id: "120363",
    name: "Launch",
    description: "",
    ownerId: "1",
    createdAt: 1_700_000_000,
    participants: [
      { id: "1", isAdmin: true, isSuperAdmin: false },
      { id: "2", phoneNumber: "+15550002", isAdmin: false, isSuperAdmin: false },
    ],
  };
  return {
    retrieve: vi.fn(async () => group),
    create: vi.fn(async (input) => ({ ...group, id: "555", name: input.name })),
    setSubject: vi.fn(async () => undefined),
    setDescription: vi.fn(async () => undefined),
    participants: vi.fn(async () => undefined),
    inviteCode: vi.fn(async () => "abc"),
    revokeInviteCode: vi.fn(async () => "def"),
    setting: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
  };
}

function client(allow: readonly PolymorfaPermission[]) {
  return new PolymorfaClient({
    fetch: vi.fn(async () =>
      Response.json({
        value: "pmfa_ct_Zml4dHVyZQ",
        audience: "browser",
        expiresAt: Date.now() + 600_000,
        grant: { session: "support", conversations: "all", allow },
      }),
    ),
  });
}

function shadowButton(host: Element, text: string): HTMLButtonElement | undefined {
  return [...host.shadowRoot!.querySelectorAll("button")].find((button) =>
    button.textContent?.includes(text),
  );
}

afterEach(() => {
  document.body.replaceChildren();
  resetDefineUiKit();
  resetPermissionWarnings();
});

describe("<pmfa-new-chat>", () => {
  it("lists contacts, filters and fires pmfa-open", async () => {
    defineUiKit({ client: client([]) });
    const element = document.createElement("pmfa-new-chat") as PolymorfaNewChatElement;
    element.contacts = contactSource();
    const opened = vi.fn();
    element.addEventListener("pmfa-open", (event) => opened((event as CustomEvent<InboxConversation>).detail));
    document.body.append(element);
    await vi.waitFor(() =>
      expect(element.shadowRoot!.querySelectorAll("[data-contact-id]")).toHaveLength(2),
    );
    const search = element.shadowRoot!.querySelector<HTMLInputElement>("input[type=search]")!;
    search.value = "hopper";
    search.dispatchEvent(new Event("input"));
    expect(element.shadowRoot!.querySelectorAll("[data-contact-id]")).toHaveLength(1);
    element.shadowRoot!.querySelector<HTMLButtonElement>("[data-contact-id='2']")!.click();
    expect(opened).toHaveBeenCalledWith(expect.objectContaining({ id: "2", kind: "direct" }));
    // The token grants no groups_manage and no groups source was given.
    expect(shadowButton(element, "New group")).toBeUndefined();
  });

  it("creates a group when the grant allows it, and honours no-groups", async () => {
    defineUiKit({ client: client(["read_contact", "groups_manage"]) });
    const element = document.createElement("pmfa-new-chat") as PolymorfaNewChatElement;
    element.contacts = contactSource();
    const groups = groupSource();
    element.groups = groups;
    const opened = vi.fn();
    element.addEventListener("pmfa-open", (event) => opened((event as CustomEvent).detail));
    document.body.append(element);
    await vi.waitFor(() => expect(shadowButton(element, "New group")).toBeDefined());
    shadowButton(element, "New group")!.click();
    const row = element.shadowRoot!.querySelector<HTMLButtonElement>("[data-contact-id='1']")!;
    expect(row.getAttribute("role")).toBe("checkbox");
    row.click();
    expect(
      element.shadowRoot!.querySelector("[data-contact-id='1']")!.getAttribute("aria-checked"),
    ).toBe("true");
    shadowButton(element, "Next")!.click();
    const name = element.shadowRoot!.querySelector<HTMLInputElement>("input[required]")!;
    name.value = "Book club";
    name.dispatchEvent(new Event("input"));
    element.shadowRoot!.querySelector("form")!.dispatchEvent(new Event("submit", { cancelable: true }));
    await vi.waitFor(() =>
      expect(opened).toHaveBeenCalledWith(expect.objectContaining({ id: "555", kind: "group" })),
    );
    expect(groups.create).toHaveBeenCalledWith({ name: "Book club", participants: ["1"] }, expect.any(AbortSignal));

    element.setAttribute("no-groups", "");
    await vi.waitFor(() =>
      expect(element.shadowRoot!.querySelectorAll("[data-contact-id]")).toHaveLength(2),
    );
    expect(shadowButton(element, "New group")).toBeUndefined();
  });

  it("closes from its back button when closable", async () => {
    defineUiKit({ client: client([]) });
    const element = document.createElement("pmfa-new-chat") as PolymorfaNewChatElement;
    element.setAttribute("closable", "");
    element.contacts = contactSource();
    const closed = vi.fn();
    element.addEventListener("pmfa-close", closed);
    document.body.append(element);
    element.shadowRoot!.querySelector<HTMLButtonElement>('[aria-label="Close"]')!.click();
    expect(closed).toHaveBeenCalledOnce();
  });
});

describe("<pmfa-group-details>", () => {
  it("renders the roster and sends member changes through the source", async () => {
    defineUiKit({ client: client([]) });
    const element = document.createElement("pmfa-group-details") as PolymorfaGroupDetailsElement;
    const source = groupSource();
    element.source = source;
    element.setAttribute("group-id", "120363");
    element.setAttribute("self-id", "1");
    document.body.append(element);
    await vi.waitFor(() => expect(element.shadowRoot!.textContent).toContain("Launch"));
    const members = [...element.shadowRoot!.querySelectorAll(".pmfa-group-member")];
    expect(members[0]!.textContent).toContain("You");
    expect(members[0]!.querySelector("details")).toBeNull();
    shadowButton(element, "Make group admin")!.click();
    await vi.waitFor(() =>
      expect(source.participants).toHaveBeenCalledWith("120363", "promote", ["2"]),
    );
    await vi.waitFor(() =>
      expect(element.shadowRoot!.querySelector(".pmfa-group-status")?.textContent).toBe("Saved"),
    );
    shadowButton(element, "Exit group")!.click();
    const left = vi.fn();
    element.addEventListener("pmfa-left", left);
    element.shadowRoot!.querySelector<HTMLButtonElement>("[role=alertdialog] .pmfa-btn-danger")!.click();
    await vi.waitFor(() => expect(left).toHaveBeenCalledOnce());
  });

  it("is read-only when the grant lacks groups_manage", async () => {
    const api = client(["groups_read"]);
    await api.refresh();
    defineUiKit({ client: api });
    const element = document.createElement("pmfa-group-details") as PolymorfaGroupDetailsElement;
    // A controller supplied by the host decides what is offered.
    const { GroupController } = await import("@polymorfa/ui-kit/internal");
    element.controller = new GroupController(groupSource(), "120363", { canManage: false });
    document.body.append(element);
    await vi.waitFor(() =>
      expect(element.shadowRoot!.textContent).toContain("You can view this group but not change it."),
    );
    expect(shadowButton(element, "Exit group")).toBeUndefined();
  });
});

describe("<pmfa-inbox> new chat and group info", () => {
  const rows: InboxConversation[] = [
    { id: "120363", kind: "group", name: "Launch", lastActivity: 2, unreadCount: 0 },
  ];
  const inboxSource: InboxDataSource = {
    listConversations: async () => ({ conversations: rows }),
    conversation: () => ({
      load: async () => ({
        messages: [
          { id: "m1", text: "Hi", createdAt: 1, direction: "inbound", status: "sent", sender: { id: "1", name: "Ada" } },
          { id: "m2", text: "Again", createdAt: 2, direction: "inbound", status: "sent", sender: { id: "1", name: "Ada" } },
        ],
      }),
      subscribe: () => () => undefined,
      send: vi.fn(),
    }),
  };

  it("opens <pmfa-new-chat> and starts a draft thread", async () => {
    const api = client(["read_messages", "read_contact"]);
    defineUiKit({ client: api });
    const inbox = document.createElement("pmfa-inbox") as PolymorfaInboxElement;
    inbox.source = inboxSource;
    inbox.contacts = contactSource();
    const selected = vi.fn();
    inbox.addEventListener("pmfa-select", (event) => selected((event as CustomEvent).detail));
    document.body.append(inbox);
    await vi.waitFor(() =>
      expect(inbox.shadowRoot!.querySelector("[data-inbox-new-chat]")).not.toBeNull(),
    );
    inbox.shadowRoot!.querySelector<HTMLButtonElement>("[data-inbox-new-chat]")!.click();
    const panel = inbox.shadowRoot!.querySelector("pmfa-new-chat") as PolymorfaNewChatElement;
    expect(panel).not.toBeNull();
    await vi.waitFor(() =>
      expect(panel.shadowRoot!.querySelectorAll("[data-contact-id]")).toHaveLength(2),
    );
    panel.shadowRoot!.querySelector<HTMLButtonElement>("[data-contact-id='1']")!.click();
    expect(selected).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
    expect(inbox.shadowRoot!.querySelector("pmfa-new-chat")).toBeNull();
    expect(inbox.shadowRoot!.querySelector(".pmfa-thread-name")?.textContent).toBe("Ada Lovelace");
  });

  it("shows group info beside a group thread", async () => {
    defineUiKit({ client: client(["read_messages", "groups_read"]) });
    const inbox = document.createElement("pmfa-inbox") as PolymorfaInboxElement;
    inbox.source = inboxSource;
    inbox.groups = groupSource();
    document.body.append(inbox);
    await vi.waitFor(() =>
      expect(inbox.shadowRoot!.querySelector("[data-conversation-id='120363']")).not.toBeNull(),
    );
    inbox.shadowRoot!.querySelector<HTMLButtonElement>("[data-conversation-id='120363']")!.click();
    const toggle = inbox.shadowRoot!.querySelector<HTMLButtonElement>("[data-group-info]")!;
    expect(toggle.getAttribute("aria-label")).toBe("Show group info");
    toggle.click();
    const info = inbox.shadowRoot!.querySelector("pmfa-group-details") as PolymorfaGroupDetailsElement;
    expect(info.getAttribute("group-id")).toBe("120363");
    await vi.waitFor(() => expect(info.shadowRoot!.textContent).toContain("2 members"));
    expect(inbox.shadowRoot!.querySelector(".pmfa-inbox")!.hasAttribute("data-contact-open")).toBe(true);
    const list = inbox.shadowRoot!.querySelector("pmfa-message-list")!;
    await vi.waitFor(() =>
      expect([...list.shadowRoot!.querySelectorAll(".pmfa-msg-sender")].map((node) => node.textContent)).toEqual([
        "Ada",
        "Ada",
      ]),
    );
    // Only the run's first message shows the name; CSS hides the rest.
    expect(list.shadowRoot!.querySelectorAll(".pmfa-msg-start .pmfa-msg-sender")).toHaveLength(1);
  });
});

describe("<pmfa-contact-list>", () => {
  it("lists, filters and fires pmfa-select with checkbox rows", async () => {
    defineUiKit({ client: client([]) });
    const list = document.createElement("pmfa-contact-list") as PolymorfaContactListElement;
    list.contacts = contactSource();
    list.setAttribute("selectable", "");
    list.selectedIds = ["1"];
    const selected = vi.fn();
    list.addEventListener("pmfa-select", (event) => selected((event as CustomEvent).detail));
    document.body.append(list);
    await vi.waitFor(() => expect(list.shadowRoot!.querySelectorAll("[data-contact-id]")).toHaveLength(2));
    expect(list.shadowRoot!.querySelector("[data-contact-id='1']")!.getAttribute("aria-checked")).toBe("true");
    const search = list.shadowRoot!.querySelector<HTMLInputElement>("input[type=search]")!;
    search.value = "grace";
    search.dispatchEvent(new Event("input"));
    expect(list.shadowRoot!.querySelectorAll("[data-contact-id]")).toHaveLength(1);
    list.shadowRoot!.querySelector<HTMLButtonElement>("[data-contact-id='2']")!.click();
    expect(selected).toHaveBeenCalledWith(contacts[1]);
  });
});
