// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PolymorfaClient,
  resetPermissionWarnings,
  InboxController,
  type GroupSource,
  type InboxConversation,
  type InboxDataSource,
  type PolymorfaPermission,
} from "@polymorfa/ui-kit/internal";
import {
  PolymorfaInboxElement,
  PolymorfaQuickLinkButtonElement,
  defineUiKit,
} from "../../src/web-components/index.js";
import { resetDefineUiKit } from "../../src/web-components/dropin.js";

function tokenFetch(allow: readonly PolymorfaPermission[]) {
  return vi.fn(async (input: RequestInfo | URL) => {
    if (String(input) === "/api/polymorfa/connect")
      return Response.json({
        data: {
          id: "ql_1",
          url: "https://link.polymorfa.com/ql_1",
          expiresAt: null,
        },
      });
    return Response.json({
      value: "pmfa_ct_Zml4dHVyZQ",
      audience: "browser",
      expiresAt: Date.now() + 600_000,
      grant: { session: "support", conversations: "all", allow },
    });
  });
}

const source: InboxDataSource = {
  listConversations: async () => ({
    conversations: [
      { id: "chat_1", name: "Ada Lovelace", lastActivity: 2, unreadCount: 1 },
      { id: "chat_2", name: "Grace Hopper", lastActivity: 1, unreadCount: 0 },
    ],
  }),
  conversation: (conversation) => ({
    load: async () => ({
      messages: [
        {
          id: "m1",
          text: `Hi ${conversation.name}`,
          createdAt: 1,
          direction: "inbound",
          status: "sent",
        },
      ],
    }),
    subscribe: () => () => undefined,
    send: vi.fn(),
  }),
};

afterEach(() => {
  document.body.replaceChildren();
  resetDefineUiKit();
  resetPermissionWarnings();
  vi.restoreAllMocks();
});

describe("defineUiKit", () => {
  it("fetches a token for the supported drop-in elements", async () => {
    const fetch = tokenFetch(["read_messages"]);
    const client = defineUiKit({ client: new PolymorfaClient({ fetch }) });
    expect(customElements.get("pmfa-inbox")).toBe(PolymorfaInboxElement);
    expect(customElements.get("pmfa-quicklink-button")).toBe(
      PolymorfaQuickLinkButtonElement,
    );
    await vi.waitFor(() => expect(client.getSnapshot().status).toBe("ready"));
    expect(fetch).toHaveBeenCalledWith(
      "/api/polymorfa/token",
      expect.objectContaining({ method: "POST" }),
    );
  });
});

describe("<pmfa-quicklink-button>", () => {
  it("links to a supplied QuickLink without a token or handler call", async () => {
    const fetch = tokenFetch([]);
    defineUiKit({
      client: new PolymorfaClient({ fetch }),
      appearance: { elements: { connectButton: { className: "host-link" } } },
    });
    const element = document.createElement(
      "pmfa-quicklink-button",
    ) as PolymorfaQuickLinkButtonElement;
    element.setAttribute("url", "https://link.polymorfa.com/ql_1");
    element.setAttribute("target", "popup");
    const opened = vi.fn();
    element.addEventListener("pmfa-open", opened);
    document.body.append(element);
    const link = element.shadowRoot!.querySelector("a")!;
    expect(link.getAttribute("href")).toBe("https://link.polymorfa.com/ql_1");
    expect(link.target).toBe("_blank");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.classList.contains("pmfa-btn-primary")).toBe(true);
    expect(link.classList.contains("host-link")).toBe(true);
    expect(link.getAttribute("part")).toBe("connect-button");
    expect(link.textContent).toBe("Connect WhatsApp");
    link.addEventListener("click", (event) => event.preventDefault());
    link.click();
    expect(opened).toHaveBeenCalledTimes(1);
    element.setAttribute("label", "Link your phone");
    expect(element.shadowRoot!.querySelector("a")!.textContent).toBe(
      "Link your phone",
    );
    expect(
      fetch.mock.calls.some(([input]) => String(input).endsWith("/connect")),
    ).toBe(false);
  });

  it("renders nothing without a warning until the URL arrives", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    defineUiKit({ client: new PolymorfaClient({ fetch: tokenFetch([]) }) });
    const element = document.createElement("pmfa-quicklink-button");
    document.body.append(element);
    expect(element.shadowRoot!.querySelector("a")).toBeNull();
    element.setAttribute("url", "");
    expect(element.shadowRoot!.querySelector("a")).toBeNull();
    element.setAttribute("url", "https://link.polymorfa.com/ql_1");
    expect(element.shadowRoot!.querySelector("a")?.getAttribute("href")).toBe(
      "https://link.polymorfa.com/ql_1",
    );
    expect(warn).not.toHaveBeenCalled();
  });

  it("renders nothing for a non-https URL and never logs the URL", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    defineUiKit({ client: new PolymorfaClient({ fetch: tokenFetch([]) }) });
    const element = document.createElement("pmfa-quicklink-button");
    element.setAttribute("url", "http://example.com/ql_secret");
    document.body.append(element);
    expect(element.shadowRoot!.querySelector("a")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).not.toContain("ql_secret");
  });
});

describe("<pmfa-inbox>", () => {
  it("filters observed unread rows and preserves search focus while typing", async () => {
    const client = defineUiKit({
      client: new PolymorfaClient({ fetch: tokenFetch(["read_messages"]) }),
    });
    await client.refresh();
    const inbox = document.createElement("pmfa-inbox") as PolymorfaInboxElement;
    inbox.source = source;
    document.body.append(inbox);
    await vi.waitFor(() =>
      expect(inbox.shadowRoot!.querySelectorAll(".pmfa-conv")).toHaveLength(2),
    );
    const search = inbox.shadowRoot!.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    search.focus();
    search.value = "Ada";
    search.dispatchEvent(new Event("input", { bubbles: true }));
    expect(inbox.shadowRoot!.querySelectorAll(".pmfa-conv")).toHaveLength(1);
    expect(
      inbox.shadowRoot!.activeElement?.getAttribute("data-inbox-search"),
    ).not.toBeNull();
    const input = inbox.shadowRoot!.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    input.value = "";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    const unread = inbox.shadowRoot!.querySelector<HTMLButtonElement>(
      '[data-inbox-filter="unread"]',
    )!;
    unread.click();
    expect(inbox.shadowRoot!.querySelectorAll(".pmfa-conv")).toHaveLength(1);
    expect(
      inbox.shadowRoot!.querySelector(".pmfa-conv-name")?.textContent,
    ).toBe("Ada Lovelace");
  });

  it("keeps the search input during an IME composition", async () => {
    const client = defineUiKit({
      client: new PolymorfaClient({ fetch: tokenFetch(["read_messages"]) }),
    });
    await client.refresh();
    const inbox = document.createElement("pmfa-inbox") as PolymorfaInboxElement;
    inbox.source = source;
    document.body.append(inbox);
    await vi.waitFor(() =>
      expect(inbox.shadowRoot!.querySelectorAll(".pmfa-conv")).toHaveLength(2),
    );
    const search = inbox.shadowRoot!.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    search.focus();
    search.value = "Ada";
    search.dispatchEvent(
      new InputEvent("input", { bubbles: true, isComposing: true }),
    );
    // Replacing the focused input would cancel the composition.
    expect(inbox.shadowRoot!.querySelector('input[type="search"]')).toBe(
      search,
    );
    expect(inbox.shadowRoot!.querySelectorAll(".pmfa-conv")).toHaveLength(2);
    search.dispatchEvent(
      new KeyboardEvent("keydown", { key: "Escape", isComposing: true }),
    );
    expect(search.value).toBe("Ada");
    search.dispatchEvent(new CompositionEvent("compositionend"));
    expect(inbox.shadowRoot!.querySelectorAll(".pmfa-conv")).toHaveLength(1);
  });

  it("renders the list and opens a read-only thread without send_message", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = defineUiKit({
      client: new PolymorfaClient({ fetch: tokenFetch(["read_messages"]) }),
    });
    await client.refresh();
    const inbox = document.createElement("pmfa-inbox") as PolymorfaInboxElement;
    inbox.source = source;
    document.body.append(inbox);
    await vi.waitFor(() =>
      expect(inbox.shadowRoot!.querySelectorAll(".pmfa-conv")).toHaveLength(2),
    );
    const rows =
      inbox.shadowRoot!.querySelectorAll<HTMLButtonElement>(".pmfa-conv");
    expect(rows[0]!.textContent).toContain("Ada Lovelace");
    rows[0]!.click();
    const shell = inbox.shadowRoot!.querySelector(".pmfa-inbox")!;
    expect(shell.getAttribute("data-view")).toBe("thread");
    expect(inbox.shadowRoot!.querySelector("pmfa-message-list")).not.toBeNull();
    expect(inbox.shadowRoot!.querySelector("pmfa-compose-box")).toBeNull();
    expect(inbox.shadowRoot!.textContent).toContain(
      "You can read this conversation but not reply.",
    );
  });

  it("adds a composer without attachments when send_message is granted", async () => {
    const client = defineUiKit({
      client: new PolymorfaClient({
        fetch: tokenFetch(["read_messages", "send_message"]),
      }),
    });
    await client.refresh();
    const inbox = document.createElement("pmfa-inbox") as PolymorfaInboxElement;
    inbox.source = source;
    document.body.append(inbox);
    await vi.waitFor(() =>
      expect(inbox.shadowRoot!.querySelectorAll(".pmfa-conv")).toHaveLength(2),
    );
    inbox.shadowRoot!.querySelector<HTMLButtonElement>(".pmfa-conv")!.click();
    const composer = inbox.shadowRoot!.querySelector("pmfa-compose-box");
    expect(composer?.getAttribute("attachments")).toBe("false");
  });
});

describe("<pmfa-inbox> retained panels", () => {
  // happy-dom keeps focus on a button whose panel was detached, and then
  // cannot resolve `activeElement`. Move focus out of the inbox first.
  function parkFocus() {
    const sink = document.createElement("button");
    document.body.append(sink);
    sink.focus();
  }
  afterEach(parkFocus);
  const group: InboxConversation = {
    id: "120363",
    kind: "group",
    name: "Launch",
    lastActivity: 3,
    unreadCount: 0,
  };
  const groupSource: GroupSource = {
    retrieve: vi.fn(async () => ({
      id: "120363",
      name: "Launch",
      description: "",
      ownerId: "1",
      createdAt: 1_700_000_000,
      participants: [{ id: "1", isAdmin: true, isSuperAdmin: false }],
    })),
    create: vi.fn(),
    setSubject: vi.fn(),
    setDescription: vi.fn(),
    participants: vi.fn(),
    inviteCode: vi.fn(),
    revokeInviteCode: vi.fn(),
    setting: vi.fn(),
    leave: vi.fn(),
  };

  async function mount() {
    const client = defineUiKit({
      client: new PolymorfaClient({ fetch: tokenFetch(["read_messages"]) }),
    });
    await client.refresh();
    const inbox = document.createElement("pmfa-inbox") as PolymorfaInboxElement;
    inbox.source = {
      ...source,
      listConversations: async () => ({ conversations: [group] }),
    };
    inbox.contacts = { list: async () => [], lookup: async () => null };
    inbox.groups = groupSource;
    inbox.callLog = { list: async () => ({ entries: [] }) };
    document.body.append(inbox);
    await vi.waitFor(() =>
      expect(
        inbox.shadowRoot!.querySelector("[data-conversation-id='120363']"),
      ).not.toBeNull(),
    );
    return inbox;
  }

  function openPanel(inbox: PolymorfaInboxElement, kind: string): Element {
    if (kind === "new-chat")
      inbox
        .shadowRoot!.querySelector<HTMLButtonElement>("[data-inbox-new-chat]")!
        .click();
    else if (kind === "call-log")
      inbox
        .shadowRoot!.querySelector<HTMLButtonElement>(
          "[data-inbox-view='calls']",
        )!
        .click();
    else {
      inbox
        .shadowRoot!.querySelector<HTMLButtonElement>(
          "[data-conversation-id='120363']",
        )!
        .click();
      inbox
        .shadowRoot!.querySelector<HTMLButtonElement>("[data-group-info]")!
        .click();
    }
    return inbox.shadowRoot!.querySelector(`pmfa-${kind}`)!;
  }

  it.each(["new-chat", "call-log", "group-details"])(
    "passes a new configuration to the open %s panel",
    async (kind) => {
      const inbox = await mount();
      openPanel(inbox, kind);
      const appearance = { theme: "dark" } as const;
      parkFocus();
      inbox.configuration = { ...inbox.configuration, appearance };
      const panel = inbox.shadowRoot!.querySelector(
        `pmfa-${kind}`,
      ) as PolymorfaInboxElement | null;
      expect(panel?.isConnected).toBe(true);
      expect(panel!.configuration.appearance).toBe(appearance);
    },
  );

  it.each(["new-chat", "call-log"])(
    "opens a chat from the %s panel in the replacement controller",
    async (kind) => {
      const inbox = await mount();
      const panel = openPanel(inbox, kind);
      const next: InboxDataSource = {
        ...source,
        listConversations: async () => ({ conversations: [group] }),
      };
      // A host may swap the source, or hand the inbox its own controller.
      if (kind === "call-log") inbox.source = next;
      else inbox.controller = new InboxController(next);
      const replacement = inbox.controller as InboxController;
      expect(inbox.shadowRoot!.querySelector(`pmfa-${kind}`)).toBe(panel);
      panel.dispatchEvent(
        new CustomEvent("pmfa-open", {
          detail: { id: "chat_9", lastActivity: 0, unreadCount: 0 },
        }),
      );
      expect(replacement.getSnapshot().selectedId).toBe("chat_9");
      expect(
        inbox.shadowRoot!.querySelector(".pmfa-thread-name")?.textContent,
      ).toBe("chat_9");
    },
  );

  it("resets the group info toggle when the panel closes itself", async () => {
    const inbox = await mount();
    const info = openPanel(inbox, "group-details");
    const toggle =
      inbox.shadowRoot!.querySelector<HTMLButtonElement>("[data-group-info]")!;
    expect(toggle.getAttribute("aria-expanded")).toBe("true");
    info.dispatchEvent(new CustomEvent("pmfa-close"));
    expect(inbox.shadowRoot!.querySelector("pmfa-group-details")).toBeNull();
    expect(
      inbox
        .shadowRoot!.querySelector("[data-group-info]")
        ?.getAttribute("aria-expanded"),
    ).toBe("false");
    expect(toggle.getAttribute("aria-label")).toBe("Show group info");
  });
});
