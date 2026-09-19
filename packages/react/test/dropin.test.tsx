// @vitest-environment happy-dom
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  PolymorfaClient,
  type ConversationMessage,
  type InboxConversation,
  type InboxDataSource,
  type PolymorfaPermission,
} from "@polymorfa/browser";
import { resetPermissionWarnings } from "@polymorfa/browser/internal";
import {
  CallButton,
  ConnectWhatsAppButton,
  Inbox,
  PolymorfaProvider,
  SessionStatus,
  TemplateManager,
  usePermissions,
} from "../src/index.js";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const conversations: InboxConversation[] = [
  {
    id: "chat_1",
    session: "support",
    name: "Ada Lovelace",
    phoneNumber: "+15550001",
    lastMessage: {
      text: "Is my order ready?",
      createdAt: 2_000,
      direction: "inbound",
    },
    lastActivity: 2_000,
    unreadCount: 2,
  },
  {
    id: "chat_2",
    session: "support",
    name: "Grace Hopper",
    lastMessage: { text: "Thanks!", createdAt: 1_000, direction: "outbound" },
    lastActivity: 1_000,
    unreadCount: 0,
  },
];

function fakeSource(): InboxDataSource & { sent: string[] } {
  const sent: string[] = [];
  return {
    sent,
    listConversations: vi.fn(async () => ({ conversations })),
    conversation: (conversation) => ({
      load: async () => ({
        messages: [
          {
            id: `${conversation.id}-m1`,
            text: `Hello from ${conversation.name}`,
            createdAt: 1_000,
            direction: "inbound",
            status: "sent",
          },
        ],
      }),
      subscribe: () => () => undefined,
      send: async (message): Promise<ConversationMessage> => {
        sent.push(message.text);
        return {
          id: `sent-${sent.length}`,
          clientId: message.clientId,
          text: message.text,
          createdAt: 3_000,
          direction: "outbound",
          status: "sent",
        };
      },
    }),
    contact: vi.fn(async (conversation) => ({
      id: conversation.id,
      name: conversation.name ?? "",
      email: "ada@example.test",
    })),
  };
}

function clientWith(allow: readonly PolymorfaPermission[]) {
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "/api/polymorfa/connect")
      return Response.json({
        data: {
          id: "ql_1",
          url: "https://link.polymorfa.com/ql_1",
          expiresAt: null,
        },
      });
    if (url === "/api/polymorfa/templates")
      return Response.json({
        templates: [
          {
            id: "tpl_1",
            name: "order_ready",
            category: "UTILITY",
            language: "en_US",
            status: "APPROVED",
            kind: "standard",
            definition: {
              version: 1,
              kind: "standard",
              category: "UTILITY",
              language: "en_US",
              body: "Your order is ready",
              variables: [],
            },
            cloudLinks: [],
            createdAt: 1,
            updatedAt: 2,
          },
        ],
      });
    return Response.json({
      value: "pmfa_ct_fixture",
      audience: "browser",
      expiresAt: Date.now() + 600_000,
      grant: { session: "support", conversations: "all", allow },
    });
  });
  return { client: new PolymorfaClient({ fetch }), fetch };
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
  vi.restoreAllMocks();
});

async function settle() {
  await act(async () => {
    for (let index = 0; index < 20; index += 1) await Promise.resolve();
  });
}

function click(element: Element | null | undefined) {
  if (!(element instanceof HTMLElement)) throw new Error("missing element");
  act(() => element.click());
}

describe("<Inbox/>", () => {
  it("renders conversations from a data source and opens a thread", async () => {
    const { client } = clientWith([
      "read_messages",
      "send_message",
      "read_contact",
    ]);
    const source = fakeSource();
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <Inbox source={source} />
        </PolymorfaProvider>,
      ),
    );
    await settle();
    const rows = host.querySelectorAll('[data-slot="conversationItem"]');
    expect(
      [...rows].map((row) => row.querySelector(".pmfa-conv-name")?.textContent),
    ).toEqual(["Ada Lovelace", "Grace Hopper"]);
    expect(rows[0]?.hasAttribute("data-unread")).toBe(true);
    expect(rows[0]?.textContent).toContain("2 unread");
    expect(rows[1]?.textContent).toContain("You: Thanks!");
    const inbox = host.querySelector('[data-pmfa="inbox"]');
    expect(inbox?.getAttribute("data-view")).toBe("list");

    click(rows[0]);
    await settle();
    expect(inbox?.getAttribute("data-view")).toBe("thread");
    expect(rows[0]?.getAttribute("aria-current")).toBe("true");
    expect(
      host.querySelector('[data-pmfa="message-list"]')?.textContent,
    ).toContain("Hello from Ada Lovelace");
    const textarea = host.querySelector("textarea");
    expect(textarea).not.toBeNull();
    expect(host.querySelector('[data-slot="composerAttach"]')).toBeNull();

    click(host.querySelector('[aria-label="Show contact details"]'));
    await settle();
    expect(
      host.querySelector('[data-pmfa="contact-panel"]')?.textContent,
    ).toContain("ada@example.test");

    click(host.querySelector('[aria-label="Back to conversations"]'));
    expect(inbox?.getAttribute("data-view")).toBe("list");
  });

  it("filters the list with search", async () => {
    const { client } = clientWith(["read_messages"]);
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <Inbox source={fakeSource()} />
        </PolymorfaProvider>,
      ),
    );
    await settle();
    const search = host.querySelector<HTMLInputElement>(
      'input[type="search"]',
    )!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        "value",
      )!.set!;
      setter.call(search, "grace");
      search.dispatchEvent(new Event("input", { bubbles: true }));
    });
    expect(
      host.querySelectorAll('[data-slot="conversationItem"]'),
    ).toHaveLength(1);
  });

  it("hides the composer and contact panel without their permissions, warning once", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = clientWith(["read_messages"]);
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <Inbox source={fakeSource()} />
        </PolymorfaProvider>,
      ),
    );
    await settle();
    click(host.querySelector('[data-slot="conversationItem"]'));
    await settle();
    expect(host.querySelector("textarea")).toBeNull();
    expect(host.textContent).toContain(
      "You can read this conversation but not reply.",
    );
    expect(
      host.querySelector('[aria-label="Show contact details"]'),
    ).toBeNull();
    const messages = warn.mock.calls.map(([message]) => String(message));
    expect(messages).toContain(
      '<Inbox/>: composer hidden; the token lacks "send_message". Add it to allow in mint().',
    );
    expect(
      messages.filter((message) => message.includes('"send_message"')),
    ).toHaveLength(1);
    // Re-rendering does not repeat the warning.
    click(host.querySelectorAll('[data-slot="conversationItem"]')[1]);
    await settle();
    expect(
      warn.mock.calls.filter(([message]) =>
        String(message).includes('"send_message"'),
      ),
    ).toHaveLength(1);
  });

  it("sends through the conversation's data source", async () => {
    const { client } = clientWith(["read_messages", "send_message"]);
    const source = fakeSource();
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <Inbox source={source} defaultConversationId="chat_2" />
        </PolymorfaProvider>,
      ),
    );
    await settle();
    const textarea = host.querySelector("textarea")!;
    act(() => {
      const setter = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        "value",
      )!.set!;
      setter.call(textarea, "On its way");
      textarea.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      textarea.closest("form")!.requestSubmit();
    });
    await settle();
    expect(source.sent).toEqual(["On its way"]);
  });

  it("renders the empty state when the grant cannot read messages", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = clientWith(["send_message"]);
    const source = fakeSource();
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <Inbox source={source} />
        </PolymorfaProvider>,
      ),
    );
    await settle();
    expect(source.listConversations).not.toHaveBeenCalled();
    expect(host.textContent).toContain("No conversations yet");
  });

  it("explains how to fix a missing provider", () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(() => act(() => root.render(<Inbox />))).toThrow(/tokenEndpoint/);
  });
});

describe("<PolymorfaProvider tokenEndpoint>", () => {
  it("fetches a token from the endpoint and shares its permissions", async () => {
    const fetch = vi.fn(async () =>
      Response.json({
        value: "pmfa_ct_fixture",
        audience: "browser",
        expiresAt: Date.now() + 600_000,
        grant: {
          session: "support",
          conversations: "all",
          allow: ["send_message"],
        },
      }),
    );
    vi.stubGlobal("fetch", fetch);
    const seen: boolean[] = [];
    function Probe() {
      const { can } = usePermissions();
      seen.push(can("send_message"));
      return null;
    }
    act(() =>
      root.render(
        <PolymorfaProvider tokenEndpoint="/auth/polymorfa/token">
          <Probe />
          <SessionStatus />
        </PolymorfaProvider>,
      ),
    );
    await settle();
    expect(fetch).toHaveBeenCalledWith(
      "/auth/polymorfa/token",
      expect.objectContaining({ method: "POST" }),
    );
    expect(seen.at(-1)).toBe(true);
    expect(seen[0]).toBe(false);
    expect(
      host
        .querySelector('[data-pmfa="session-status"]')
        ?.getAttribute("data-status"),
    ).toBe("ready");
    vi.unstubAllGlobals();
  });
});

describe("<ConnectWhatsAppButton/>", () => {
  it("creates the QuickLink through the handler and opens the hosted page", async () => {
    const { client, fetch } = clientWith(["connect_whatsapp"]);
    const open = vi.fn();
    const onConnect = vi.fn();
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <ConnectWhatsAppButton open={open} onConnect={onConnect} />
        </PolymorfaProvider>,
      ),
    );
    await act(async () => void (await client.refresh()));
    const button = host.querySelector('[data-pmfa="connect-whatsapp"]');
    expect(button?.textContent).toBe("Connect WhatsApp");
    click(button);
    await settle();
    expect(fetch).toHaveBeenCalledWith(
      "/api/polymorfa/connect",
      expect.objectContaining({ method: "POST" }),
    );
    expect(open).toHaveBeenCalledWith("https://link.polymorfa.com/ql_1");
    expect(onConnect).toHaveBeenCalledWith(
      expect.objectContaining({ id: "ql_1" }),
    );
    expect(host.querySelector("iframe")).toBeNull();
  });

  it("shows an accessible error when the handler refuses", async () => {
    const fetch = vi.fn(async (input: RequestInfo | URL) =>
      String(input).endsWith("/connect")
        ? Response.json(
            { error: { code: "x", message: "no" } },
            { status: 500 },
          )
        : Response.json({
            value: "pmfa_ct_fixture",
            audience: "browser",
            expiresAt: Date.now() + 600_000,
            grant: {
              session: "s",
              conversations: [],
              allow: ["connect_whatsapp"],
            },
          }),
    );
    const client = new PolymorfaClient({ fetch });
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <ConnectWhatsAppButton open={vi.fn()} />
        </PolymorfaProvider>,
      ),
    );
    await act(async () => void (await client.refresh()));
    click(host.querySelector('[data-pmfa="connect-whatsapp"]'));
    await settle();
    const alert = host.querySelector('[role="alert"]');
    expect(alert?.textContent).toBe(
      "Could not start the connection. Try again.",
    );
    expect(
      host
        .querySelector('[data-pmfa="connect-whatsapp"]')
        ?.getAttribute("aria-describedby"),
    ).toBe(alert?.id);
  });
});

describe("permission-aware components", () => {
  it("hide ConnectWhatsAppButton, CallButton and TemplateManager without their permissions", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    const { client } = clientWith(["read_messages"]);
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <ConnectWhatsAppButton />
          <CallButton to="+15550001" />
          <TemplateManager />
        </PolymorfaProvider>,
      ),
    );
    await act(async () => void (await client.refresh()));
    await settle();
    expect(host.innerHTML).toBe("");
    const warnings = warn.mock.calls.map(([message]) => String(message));
    expect(warnings).toEqual(
      expect.arrayContaining([
        expect.stringContaining(
          '<ConnectWhatsAppButton/>: button hidden; the token lacks "connect_whatsapp"',
        ),
        expect.stringContaining(
          '<CallButton/>: button hidden; the token lacks "voip_place"',
        ),
        expect.stringContaining(
          '<TemplateManager/>: templates hidden; the token lacks "manage_templates"',
        ),
      ]),
    );
  });

  it("stays silent in production builds", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.stubEnv("NODE_ENV", "production");
    const { client } = clientWith(["read_messages"]);
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <ConnectWhatsAppButton />
        </PolymorfaProvider>,
      ),
    );
    await act(async () => void (await client.refresh()));
    expect(warn).not.toHaveBeenCalled();
    vi.unstubAllEnvs();
  });

  it("lists templates with manage_templates", async () => {
    const { client } = clientWith(["manage_templates"]);
    act(() =>
      root.render(
        <PolymorfaProvider client={client}>
          <TemplateManager />
        </PolymorfaProvider>,
      ),
    );
    await act(async () => void (await client.refresh()));
    await settle();
    const item = host.querySelector('[data-slot="templateItem"]');
    expect(item?.textContent).toContain("order_ready");
    expect(item?.textContent).toContain("APPROVED");
    click(item);
    await settle();
    expect(host.querySelector('[data-pmfa="template-builder"]')).not.toBeNull();
  });

  it("render in unstyled mode with slot class names", async () => {
    document.getElementById("pmfa-component-styles")?.remove();
    const { client } = clientWith(["read_messages"]);
    act(() =>
      root.render(
        <PolymorfaProvider client={client} appearance={{ unstyled: true }}>
          <Inbox
            source={fakeSource()}
            classNames={{ inbox: "my-inbox", conversationItem: "my-row" }}
          />
        </PolymorfaProvider>,
      ),
    );
    await settle();
    expect(host.querySelector(".my-inbox")).not.toBeNull();
    expect(host.querySelectorAll(".my-row")).toHaveLength(2);
    expect(document.getElementById("pmfa-component-styles")).toBeNull();
  });
});
