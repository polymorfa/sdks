// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  PolymorfaClient,
  resetPermissionWarnings,
  type InboxDataSource,
  type PolymorfaPermission,
} from "@polymorfa/browser/internal";
import {
  PolymorfaConnectWhatsAppElement,
  PolymorfaInboxElement,
  PolymorfaSessionStatusElement,
  definePolymorfa,
} from "../src/index.js";
import { resetDefinePolymorfa } from "../src/dropin.js";

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
      value: "pmfa_ct_fixture",
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
  resetDefinePolymorfa();
  resetPermissionWarnings();
  vi.restoreAllMocks();
});

describe("definePolymorfa", () => {
  it("fetches a token and defines the drop-in elements", async () => {
    const fetch = tokenFetch(["connect_whatsapp"]);
    const client = definePolymorfa({
      client: new PolymorfaClient({ fetch }),
    });
    expect(customElements.get("pmfa-inbox")).toBe(PolymorfaInboxElement);
    expect(customElements.get("pmfa-session-status")).toBe(
      PolymorfaSessionStatusElement,
    );
    const status = document.createElement("pmfa-session-status");
    document.body.append(status);
    await vi.waitFor(() => expect(client.getSnapshot().status).toBe("ready"));
    expect(
      status.shadowRoot
        ?.querySelector(".pmfa-session")
        ?.getAttribute("data-status"),
    ).toBe("ready");
  });

  it("opens the hosted QuickLink from <pmfa-connect-whatsapp>", async () => {
    const fetch = tokenFetch(["connect_whatsapp"]);
    const client = definePolymorfa({ client: new PolymorfaClient({ fetch }) });
    await client.refresh();
    const assign = vi.fn();
    vi.spyOn(window, "location", "get").mockReturnValue({
      ...window.location,
      assign,
    } as unknown as Location);
    const connect = document.createElement(
      "pmfa-connect-whatsapp",
    ) as PolymorfaConnectWhatsAppElement;
    const connected = vi.fn();
    connect.addEventListener("pmfa-connect", connected);
    document.body.append(connect);
    const button = connect.shadowRoot!.querySelector("button")!;
    expect(button.textContent).toBe("Connect WhatsApp");
    button.click();
    await vi.waitFor(() => expect(connected).toHaveBeenCalled());
    expect(assign).toHaveBeenCalledWith("https://link.polymorfa.com/ql_1");
  });

  it("hides <pmfa-connect-whatsapp> without connect_whatsapp and warns once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = definePolymorfa({
      client: new PolymorfaClient({ fetch: tokenFetch(["read_messages"]) }),
    });
    await client.refresh();
    const connect = document.createElement("pmfa-connect-whatsapp");
    document.body.append(connect);
    expect(connect.shadowRoot!.querySelector("button")).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(String(warn.mock.calls[0]?.[0])).toContain('"connect_whatsapp"');
  });
});

describe("<pmfa-inbox>", () => {
  it("renders the list and opens a read-only thread without send_message", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const client = definePolymorfa({
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
    const client = definePolymorfa({
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
