// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  ConversationController,
  type BrowserGroup,
  type ContactDirectorySource,
  type DirectoryContact,
  type GroupSource,
  type InboxConversation,
  type InboxDataSource,
} from "@polymorfa/ui-kit";
import { resetPermissionWarnings } from "@polymorfa/ui-kit/internal";
import {
  ContactList,
  ContactListView,
  GroupDetails,
  Inbox,
  MessageList,
  NewChat,
  PolymorfaProvider,
} from "../../src/react/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const contacts: DirectoryContact[] = [
  { id: "1", name: "Ada Lovelace", phoneNumber: "+15550001" },
  { id: "2", name: "Grace Hopper", phoneNumber: "+15550002" },
  { id: "3", pushName: "linus", phoneNumber: "+15550003" },
];

function contactSource(): ContactDirectorySource & { lookup: ReturnType<typeof vi.fn> } {
  return {
    list: vi.fn(async () => contacts),
    lookup: vi.fn(async (phone: string) =>
      phone === "+15559990000" ? { id: "77", phoneNumber: phone } : null,
    ),
  };
}

function groupSource(): GroupSource & { current: BrowserGroup } {
  const state = {
    current: {
      id: "120363",
      name: "Launch",
      description: "",
      ownerId: "1",
      createdAt: 1_700_000_000,
      participants: [
        { id: "1", phoneNumber: "+15550001", isAdmin: true, isSuperAdmin: true },
        { id: "2", phoneNumber: "+15550002", isAdmin: false, isSuperAdmin: false },
      ],
    } as BrowserGroup,
  };
  return Object.assign(state, {
    retrieve: vi.fn(async () => state.current),
    create: vi.fn(async (input: { name: string }) => ({ ...state.current, id: "555", name: input.name })),
    setSubject: vi.fn(async (_id: string, value: string) => {
      state.current = { ...state.current, name: value };
    }),
    setDescription: vi.fn(async () => undefined),
    participants: vi.fn(async () => undefined),
    inviteCode: vi.fn(async () => "abc"),
    revokeInviteCode: vi.fn(async () => "def"),
    setting: vi.fn(async () => undefined),
    leave: vi.fn(async () => undefined),
  });
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  resetPermissionWarnings();
  host = document.createElement("div");
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

async function settle() {
  for (let index = 0; index < 5; index += 1) await act(async () => undefined);
}

async function render(node: React.ReactNode) {
  await act(async () => {
    root.render(<PolymorfaProvider>{node}</PolymorfaProvider>);
  });
  await settle();
}

function type(input: HTMLInputElement, value: string) {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function click(node: Element | null | undefined) {
  if (!node) throw new Error("missing node");
  act(() => (node as HTMLElement).click());
}

const byLabel = (label: string) =>
  host.querySelector<HTMLElement>(`[aria-label="${label}"]`);
const buttonText = (label: string) =>
  [...host.querySelectorAll("button")].find((button) => button.textContent?.trim() === label);

describe("<NewChat/>", () => {
  it("lists contacts, searches and opens the chosen conversation", async () => {
    const onOpen = vi.fn();
    await render(<NewChat contacts={contactSource()} onOpen={onOpen} />);
    const rows = [...host.querySelectorAll("[data-contact-id]")];
    expect(rows.map((row) => row.textContent)).toEqual([
      "ALAda Lovelace+15550001",
      "GHGrace Hopper+15550002",
      "Llinus+15550003",
    ]);
    type(byLabel("Search name or number") as HTMLInputElement, "grace");
    expect(host.querySelectorAll("[data-contact-id]")).toHaveLength(1);
    click(host.querySelector("[data-contact-id='2']"));
    expect(onOpen).toHaveBeenCalledWith(
      expect.objectContaining({ id: "2", kind: "direct", name: "Grace Hopper" }),
    );
    // No group source and no grant: no "New group" row.
    expect(buttonText("New group")).toBeUndefined();
  });

  it("checks an unsaved number before offering to message it", async () => {
    const onOpen = vi.fn();
    const source = contactSource();
    await render(<NewChat contacts={source} onOpen={onOpen} />);
    type(byLabel("Search name or number") as HTMLInputElement, "+1 555 999 0000");
    await act(async () => buttonText("Check +15559990000 on WhatsApp")!.click());
    expect(source.lookup).toHaveBeenCalledWith("+15559990000", expect.any(AbortSignal));
    click(
      [...host.querySelectorAll("button")].find((button) =>
        button.textContent?.includes("Message +15559990000"),
      ),
    );
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "77" }));
  });

  it("says when a number is not on WhatsApp", async () => {
    await render(<NewChat contacts={contactSource()} onOpen={() => undefined} />);
    type(byLabel("Search name or number") as HTMLInputElement, "+1 555 123 4567");
    await act(async () => buttonText("Check +15551234567 on WhatsApp")!.click());
    expect(host.querySelector("[role=status]")?.textContent).toBe(
      "+15551234567 is not on WhatsApp",
    );
  });

  it("shows a retryable load error", async () => {
    const list = vi
      .fn()
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce(contacts);
    await render(<NewChat contacts={{ list }} onOpen={() => undefined} />);
    expect(host.querySelector("[role=alert]")?.textContent).toContain("Unable to load contacts");
    await act(async () => buttonText("Retry")!.click());
    expect(host.querySelectorAll("[data-contact-id]")).toHaveLength(3);
  });

  it("creates a group in two steps with checkbox rows", async () => {
    const onOpen = vi.fn();
    const groups = groupSource();
    await render(<NewChat contacts={contactSource()} groups={groups} onOpen={onOpen} onClose={() => undefined} />);
    click(buttonText("New group"));
    expect(host.querySelector("h2")?.textContent).toBe("Add group members");
    const ada = host.querySelector("[data-contact-id='1']")!;
    expect(ada.getAttribute("role")).toBe("checkbox");
    click(ada);
    expect(host.querySelector("[data-contact-id='1']")!.getAttribute("aria-checked")).toBe("true");
    expect(byLabel("Remove Ada Lovelace")).not.toBeNull();
    click(buttonText("Next"));
    const name = host.querySelector<HTMLInputElement>("input[required]")!;
    expect(buttonText("Create group")!.hasAttribute("disabled")).toBe(true);
    type(name, "Book club");
    await act(async () => buttonText("Create group")!.click());
    expect(groups.create).toHaveBeenCalledWith(
      { name: "Book club", participants: ["1"] },
      expect.any(AbortSignal),
    );
    expect(onOpen).toHaveBeenCalledWith(expect.objectContaining({ id: "555", kind: "group" }));
  });

  it("moves through rows with the arrow keys", async () => {
    await render(<NewChat contacts={contactSource()} onOpen={() => undefined} />);
    const first = host.querySelector<HTMLButtonElement>("[data-contact-id='1']")!;
    first.focus();
    act(() => {
      first.dispatchEvent(new KeyboardEvent("keydown", { key: "ArrowDown", bubbles: true }));
    });
    expect(document.activeElement?.getAttribute("data-contact-id")).toBe("2");
  });
});

describe("<GroupDetails/>", () => {
  it("shows the roster and renames, demotes and removes through the source", async () => {
    const source = groupSource();
    await render(<GroupDetails groupId="120363" source={source} selfId="1" contacts={contactSource()} />);
    expect(host.textContent).toContain("Launch");
    expect(host.textContent).toContain("2 members");
    const members = [...host.querySelectorAll(".pmfa-group-member")];
    expect(members[0]!.textContent).toContain("You");
    expect(members[0]!.textContent).toContain("Group admin");
    // No actions on yourself.
    expect(members[0]!.querySelector("details")).toBeNull();
    click(byLabel("Edit: Group name"));
    const input = host.querySelector<HTMLInputElement>(".pmfa-group-edit input")!;
    type(input, "Launch v2");
    await act(async () => buttonText("Save")!.click());
    expect(source.setSubject).toHaveBeenCalledWith("120363", "Launch v2");
    expect(host.textContent).toContain("Launch v2");
    expect(host.querySelector("[role=status].pmfa-group-status")?.textContent).toBe("Saved");
    await act(async () => buttonText("Make group admin")!.click());
    expect(source.participants).toHaveBeenCalledWith("120363", "promote", ["2"]);
    await act(async () => buttonText("Remove from group")!.click());
    expect(source.participants).toHaveBeenCalledWith("120363", "remove", ["2"]);
  });

  it("adds members, applies a setting, shows the invite link and exits after confirming", async () => {
    const source = groupSource();
    const onLeft = vi.fn();
    await render(
      <GroupDetails groupId="120363" source={source} contacts={contactSource()} onLeft={onLeft} />,
    );
    click(buttonText("Add members"));
    await act(async () => undefined);
    // Existing members are not offered again.
    expect([...host.querySelectorAll(".pmfa-group-add [data-contact-id]")].map((row) => row.getAttribute("data-contact-id"))).toEqual(["3"]);
    click(host.querySelector(".pmfa-group-add [data-contact-id='3']"));
    await act(async () => buttonText("Add")!.click());
    expect(source.participants).toHaveBeenCalledWith("120363", "add", ["3"]);
    const messaging = host.querySelector('[role=group][aria-label="Send messages"]')!;
    await act(async () => [...messaging.querySelectorAll("button")].find((b) => b.textContent === "Only admins")!.click());
    expect(source.setting).toHaveBeenCalledWith("120363", { setting: "messaging", adminsOnly: true });
    await act(async () => buttonText("Show invite code")!.click());
    expect(host.querySelector(".pmfa-group-code")?.textContent).toBe("https://chat.whatsapp.com/abc");
    click(buttonText("Exit group"));
    expect(host.querySelector("[role=alertdialog]")).not.toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>("[role=alertdialog] .pmfa-btn-danger")!.click());
    expect(source.leave).toHaveBeenCalledWith("120363");
    expect(onLeft).toHaveBeenCalledOnce();
    expect(host.textContent).toContain("You exited this group.");
  });

  it("shows a refusal from WhatsApp without losing the group", async () => {
    const source = groupSource();
    source.participants = vi.fn(async () => {
      throw new Error("not an admin");
    });
    await render(<GroupDetails groupId="120363" source={source} />);
    await act(async () => buttonText("Remove from group")!.click());
    expect(host.querySelector(".pmfa-group-status")?.textContent).toBe(
      "That change did not go through: not an admin",
    );
    expect(host.textContent).toContain("Launch");
  });
});

describe("<Inbox/> new chat and groups", () => {
  function inboxSource(rows: InboxConversation[]): InboxDataSource {
    return {
      listConversations: async () => ({ conversations: rows }),
      conversation: () => ({
        load: async () => ({
          messages: [
            { id: "m1", text: "Hi all", createdAt: 1, direction: "inbound", status: "sent", sender: { id: "1", name: "Ada" } },
            { id: "m2", text: "Second", createdAt: 2, direction: "inbound", status: "sent", sender: { id: "1", name: "Ada" } },
            { id: "m3", text: "Hello", createdAt: 3, direction: "inbound", status: "sent", sender: { id: "2", phoneNumber: "+15550002" } },
          ],
        }),
        subscribe: () => () => undefined,
        send: vi.fn(),
      }),
    };
  }

  it("opens New chat in the list column and starts a draft conversation", async () => {
    const onSelect = vi.fn();
    await render(
      <Inbox
        source={inboxSource([{ id: "9", name: "Existing", lastActivity: 1, unreadCount: 0 }])}
        contacts={contactSource()}
        onSelect={onSelect}
      />,
    );
    click(byLabel("New chat"));
    await settle();
    expect(host.querySelector("[data-pmfa=new-chat]")).not.toBeNull();
    expect(host.querySelector("[data-pmfa=conversation-list]")).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>("[data-contact-id='1']")!.click());
    expect(onSelect).toHaveBeenCalledWith(expect.objectContaining({ id: "1" }));
    expect(host.querySelector("[data-pmfa=inbox]")?.getAttribute("data-view")).toBe("thread");
    expect(host.querySelector(".pmfa-thread-name")?.textContent).toBe("Ada Lovelace");
    expect(host.querySelector("[data-pmfa=conversation-list]")).not.toBeNull();
  });

  it("shows group info for groups and sender names once per run", async () => {
    const groups = groupSource();
    await render(
      <Inbox
        source={inboxSource([{ id: "120363", kind: "group", name: "Launch", lastActivity: 1, unreadCount: 0 }])}
        contacts={contactSource()}
        groups={groups}
        defaultConversationId="120363"
      />,
    );
    await settle();
    expect([...host.querySelectorAll(".pmfa-msg-sender")].map((node) => node.textContent)).toEqual([
      "Ada",
      "+15550002",
    ]);
    click(byLabel("Show group info"));
    await act(async () => undefined);
    expect(host.querySelector("[data-pmfa=group-details]")).not.toBeNull();
    expect(byLabel("Hide group info")?.getAttribute("aria-expanded")).toBe("true");
  });
});

describe("<MessageList/> quotes in groups", () => {
  it("names the quoted group author", async () => {
    const controller = new ConversationController({
      load: async () => ({
        messages: [
          { id: "a", text: "Original", createdAt: 1, direction: "inbound", status: "sent", sender: { id: "5", name: "Linus" } },
          { id: "b", text: "Reply", createdAt: 2, direction: "outbound", status: "sent", replyTo: "a" },
        ],
      }),
      subscribe: () => () => undefined,
      send: vi.fn(),
    });
    await controller.load();
    await render(<MessageList controller={controller} />);
    expect(host.querySelector(".pmfa-quote-name")?.textContent).toBe("Linus");
  });
});

describe("public contact lists", () => {
  it("ContactListView stands alone with the shared shell, classes and selection", async () => {
    const onSelect = vi.fn();
    await render(
      <ContactListView
        contacts={contacts}
        label="Team"
        selectable
        selectedIds={["2"]}
        onSelect={onSelect}
        className="mine"
        classNames={{ contactItem: "row" }}
        renderMeta={(contact) => <span className="meta">{contact.id}</span>}
      />,
    );
    const list = host.querySelector("ul")!;
    expect(list.className).toContain("pmfa-contact-list");
    expect(list.className).toContain("mine");
    expect(list.className).toMatch(/\bpmfa\b/);
    expect(list.getAttribute("aria-label")).toBe("Team");
    expect(document.getElementById("pmfa-component-styles")).not.toBeNull();
    const rows = [...host.querySelectorAll<HTMLButtonElement>("[data-contact-id]")];
    expect(rows[0]!.className).toContain("row");
    expect(rows[1]!.getAttribute("aria-checked")).toBe("true");
    expect(host.querySelectorAll(".meta")).toHaveLength(3);
    act(() => rows[0]!.click());
    expect(onSelect).toHaveBeenCalledWith(contacts[0]);
  });

  it("ContactList loads, searches and selects", async () => {
    const onSelect = vi.fn();
    await render(<ContactList contacts={contactSource()} onSelect={onSelect} />);
    expect(host.querySelector("[data-pmfa=contact-list] h2")?.textContent).toBe("Contacts on WhatsApp");
    type(host.querySelector<HTMLInputElement>("input[type=search]")!, "linus");
    expect(host.querySelectorAll("[data-contact-id]")).toHaveLength(1);
    act(() => host.querySelector<HTMLButtonElement>("[data-contact-id='3']")!.click());
    expect(onSelect).toHaveBeenCalledWith(contacts[2]);
  });
});
