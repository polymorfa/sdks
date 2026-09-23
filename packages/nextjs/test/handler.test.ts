import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createDevelopmentInboxStore,
  createPolymorfaHandler,
  type ClientTokenMintInput,
  type PolymorfaGrantInput,
  type QuickLinkInput,
  type PolymorfaHandlerOptions,
  type RelayEvent,
} from "../src/index.js";
import { toExpress } from "../src/express.js";
import { toHono } from "../src/hono.js";
import { MessagingClient } from "../../typescript/src/index.js";

type User = { readonly id: string };

const BASE = "https://app.test/api/polymorfa";

function sdk() {
  return {
    clientTokens: {
      mint: vi.fn(
        async (input: ClientTokenMintInput) => (
          void input,
          {
            data: {
              success: true as const,
              data: {
                token: "pmfa_ct_fixture",
                expiresAt: new Date(Date.now() + 600_000).toISOString(),
              },
            },
          }
        ),
      ),
    },
    quickLinks: {
      create: vi.fn(
        async (input: QuickLinkInput) => (
          void input,
          {
            data: {
              success: true as const,
              data: {
                id: "ql_1",
                url: "https://link.polymorfa.com/ql_1",
                session: "support",
                expiresAt: "2026-09-20T00:00:00Z",
              },
            },
          }
        ),
      ),
    },
  };
}

const grant: PolymorfaGrantInput = {
  session: "support",
  conversations: ["chat_1"],
  allow: ["read_messages", "send_message", "subscribe_events"],
};

function handler(overrides: Partial<PolymorfaHandlerOptions<User>> = {}) {
  const polymorfa = sdk();
  const options: PolymorfaHandlerOptions<User> = {
    polymorfa,
    authenticate: () => ({ id: "user_1" }),
    mint: () => grant,
    ...overrides,
  };
  return { polymorfa, route: createPolymorfaHandler(options) };
}

const post = (path: string, init: RequestInit = {}) =>
  new Request(`${BASE}/${path}`, { method: "POST", ...init });
const get = (path: string, init: RequestInit = {}) =>
  new Request(`${BASE}/${path}`, init);

describe("createPolymorfaHandler options", () => {
  it("accepts the server MessagingClient", () => {
    const polymorfa = new MessagingClient({
      credential: { type: "apiKey", value: `pmfa_${"A".repeat(72)}` },
    });
    expect(
      createPolymorfaHandler({
        polymorfa,
        authenticate: () => null,
        mint: () => grant,
        connect: () => ({}),
        templates: { projectSlug: () => "p", submissionSession: () => "s" },
        media: { mode: "proxy", authorize: () => null },
      }).POST,
    ).toBeTypeOf("function");
  });

  it("requires mint and authenticate", () => {
    const polymorfa = sdk();
    expect(() =>
      createPolymorfaHandler({
        polymorfa,
        authenticate: () => null,
      } as unknown as PolymorfaHandlerOptions<User>),
    ).toThrow(/mint is required/);
    expect(() =>
      createPolymorfaHandler({
        polymorfa,
        mint: () => grant,
      } as unknown as PolymorfaHandlerOptions<User>),
    ).toThrow(/authenticate is required/);
    expect(() =>
      createPolymorfaHandler({
        polymorfa: {} as never,
        authenticate: () => null,
        mint: () => grant,
      }),
    ).toThrow(/MessagingClient/);
  });
});

describe("POST /token", () => {
  it("answers 401 when authenticate returns null, without minting", async () => {
    const { route, polymorfa } = handler({ authenticate: () => null });
    const response = await route.POST(post("token"));
    expect(response.status).toBe(401);
    expect(await response.json()).toEqual({
      error: { code: "unauthenticated", message: "Sign in to continue." },
    });
    expect(polymorfa.clientTokens.mint).not.toHaveBeenCalled();
  });

  it("answers 403 when mint refuses", async () => {
    const { route, polymorfa } = handler({ mint: () => null });
    expect((await route.POST(post("token"))).status).toBe(403);
    expect(polymorfa.clientTokens.mint).not.toHaveBeenCalled();
  });

  it("mints the grant for the signed-in user and returns it with the token", async () => {
    const mint = vi.fn(() => grant);
    const { route, polymorfa } = handler({ mint });
    const response = await route.POST(post("token"));
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mint).toHaveBeenCalledWith({ id: "user_1" }, expect.any(Request));
    expect(polymorfa.clientTokens.mint).toHaveBeenCalledWith(
      { session: "support", ephemeralId: "user_1", ttlSeconds: 600 },
      { signal: expect.any(AbortSignal) },
    );
    const body = await response.json();
    expect(body).toMatchObject({
      value: "pmfa_ct_fixture",
      audience: "browser",
      scopes: grant.allow,
      grant: {
        session: "support",
        conversations: ["chat_1"],
        allow: grant.allow,
      },
    });
    expect(typeof body.expiresAt).toBe("number");
  });

  it("never reads permissions from the browser", async () => {
    const { route, polymorfa } = handler();
    await route.POST(
      post("token?allow=manage_templates", {
        body: JSON.stringify({ allow: ["manage_templates"], session: "x" }),
        headers: { "content-type": "application/json" },
      }),
    );
    expect(polymorfa.clientTokens.mint.mock.calls[0]?.[0]).toEqual({
      session: "support",
      ephemeralId: "user_1",
      ttlSeconds: 600,
    });
  });

  it("narrows Customer tokens to the API actions in allow", async () => {
    const { route, polymorfa } = handler({
      mint: () => ({
        customer: "4f6b3c1e-0000-4000-8000-000000000001",
        conversations: "all",
        allow: ["read_messages", "send_message", "read_contact"],
        ttlSeconds: 300,
        ephemeralId: "agent-7",
      }),
    });
    expect((await route.POST(post("token"))).status).toBe(200);
    expect(polymorfa.clientTokens.mint.mock.calls[0]?.[0]).toEqual({
      customer: "4f6b3c1e-0000-4000-8000-000000000001",
      allow: ["send_message", "read_contact"],
      ephemeralId: "agent-7",
      ttlSeconds: 300,
    });
  });

  it("refuses a Customer grant with no API action instead of widening it", async () => {
    const onError = vi.fn();
    const { route, polymorfa } = handler({
      onError,
      mint: () => ({
        customer: "4f6b3c1e-0000-4000-8000-000000000001",
        conversations: "all",
        allow: ["read_messages"],
      }),
    });
    expect((await route.POST(post("token"))).status).toBe(500);
    expect(polymorfa.clientTokens.mint).not.toHaveBeenCalled();
    expect(onError).toHaveBeenCalledOnce();
  });

  it.each([
    ["an empty allow list", { ...grant, allow: [] }],
    ["an unknown permission", { ...grant, allow: ["everything"] }],
    ["no conversations", { session: "support", allow: ["send_message"] }],
    ["session and customer", { ...grant, customer: "c" }],
    ["a tiny ttl", { ...grant, ttlSeconds: 5 }],
  ])("fails closed for %s without leaking details", async (_name, bad) => {
    const { route, polymorfa } = handler({
      mint: () => bad as unknown as PolymorfaGrantInput,
    });
    const response = await route.POST(post("token"));
    expect(response.status).toBe(500);
    expect(await response.json()).toEqual({
      error: { code: "handler_failed", message: "The Polymorfa route failed." },
    });
    expect(polymorfa.clientTokens.mint).not.toHaveBeenCalled();
  });

  it("answers 405 with Allow for the wrong method", async () => {
    const { route } = handler();
    const response = await route.GET(get("token"));
    expect(response.status).toBe(405);
    expect(response.headers.get("allow")).toBe("POST");
  });

  it("answers 404 for unknown and unconfigured routes", async () => {
    const { route } = handler();
    expect((await route.GET(get("nope"))).status).toBe(404);
    expect((await route.GET(get("events"))).status).toBe(404);
    expect(
      (
        await route.POST(
          new Request("https://app.test/other/token", { method: "POST" }),
        )
      ).status,
    ).toBe(404);
  });
});

describe("history routes", () => {
  const history = {
    conversations: vi.fn(async () => ({
      data: [
        { id: "chat_1", lastActivity: 2, unreadCount: 0 },
        { id: "chat_2", lastActivity: 1, unreadCount: 3 },
      ],
      nextCursor: "c2",
    })),
    messages: vi.fn(async () => ({
      data: [
        {
          id: "m1",
          text: "hi",
          createdAt: 1,
          direction: "inbound" as const,
          status: "sent" as const,
        },
      ],
    })),
    contact: vi.fn(async () => ({ id: "chat_1", name: "Ada" })),
  };

  it("drops conversations outside the grant", async () => {
    const { route } = handler({ history });
    const response = await route.GET(get("history/conversations?cursor=c1"));
    expect(await response.json()).toEqual({
      data: [{ id: "chat_1", lastActivity: 2, unreadCount: 0 }],
      nextCursor: "c2",
    });
    expect(history.conversations).toHaveBeenLastCalledWith(
      expect.objectContaining({ user: { id: "user_1" } }),
      { cursor: "c1" },
    );
  });

  it("answers 404 for a conversation outside the grant, like a missing one", async () => {
    const { route } = handler({ history });
    const response = await route.GET(
      get("history/conversations/chat_2/messages"),
    );
    expect(response.status).toBe(404);
    expect(history.messages).not.toHaveBeenCalledWith(
      expect.anything(),
      "chat_2",
      expect.anything(),
    );
    const allowed = await route.GET(
      get("history/conversations/chat_1/messages"),
    );
    expect((await allowed.json()).data).toHaveLength(1);
  });

  it("requires read_messages and read_contact", async () => {
    const { route } = handler({
      history,
      mint: () => ({ ...grant, allow: ["send_message"] }),
    });
    const response = await route.GET(get("history/conversations"));
    expect(response.status).toBe(403);
    expect((await response.json()).error.code).toBe("permission_missing");
    const { route: noContact } = handler({ history });
    expect(
      (await noContact.GET(get("history/conversations/chat_1/contact"))).status,
    ).toBe(403);
  });
});

describe("GET /events", () => {
  it("streams only events for the grant's session and conversations", async () => {
    const events: RelayEvent[] = [
      {
        id: "e1",
        session: "support",
        event: "message.received",
        timestamp: "2026-09-19T10:00:00Z",
        payload: { id: "m1", conversation: { id: "chat_1" }, text: "hi" },
      },
      {
        id: "e2",
        session: "support",
        event: "message.received",
        timestamp: "2026-09-19T10:00:01Z",
        payload: { id: "m2", conversation: { id: "chat_9" }, text: "secret" },
      },
      {
        id: "e3",
        session: "sales",
        event: "session.status",
        timestamp: "2026-09-19T10:00:02Z",
        payload: { status: "connected" },
      },
      {
        id: "e4",
        session: "support",
        event: "session.status",
        timestamp: "2026-09-19T10:00:03Z",
        payload: { status: "connected" },
      },
    ];
    const source = vi.fn(async function* () {
      yield* events;
    });
    const { route } = handler({ events: source });
    const response = await route.GET(
      get("events", { headers: { "last-event-id": "e0" } }),
    );
    expect(response.headers.get("content-type")).toContain("text/event-stream");
    const text = await response.text();
    expect(text).toContain("id: e1\n");
    expect(text).toContain("id: e4\n");
    expect(text).not.toContain("secret");
    expect(text).not.toContain("id: e3");
    expect(source).toHaveBeenCalledWith(
      expect.objectContaining({ lastEventId: "e0" }),
    );
  });

  it("requires subscribe_events", async () => {
    const { route } = handler({
      events: async function* () {},
      mint: () => ({ ...grant, allow: ["read_messages"] }),
    });
    expect((await route.GET(get("events"))).status).toBe(403);
  });
});

describe("POST /connect", () => {
  it("creates a QuickLink on the server and returns only the hosted URL", async () => {
    const connect = vi.fn(() => ({ externalId: "user_1" }));
    const { route, polymorfa } = handler({
      connect,
      mint: () => ({ ...grant, allow: ["connect_whatsapp"] }),
    });
    const response = await route.POST(post("connect"));
    expect(await response.json()).toEqual({
      data: {
        id: "ql_1",
        url: "https://link.polymorfa.com/ql_1",
        expiresAt: "2026-09-20T00:00:00Z",
      },
    });
    expect(polymorfa.quickLinks.create).toHaveBeenCalledWith(
      { externalId: "user_1" },
      { signal: expect.any(AbortSignal) },
    );
  });

  it("is hidden behind connect_whatsapp", async () => {
    const { route, polymorfa } = handler({ connect: () => ({}) });
    expect((await route.POST(post("connect"))).status).toBe(403);
    expect(polymorfa.quickLinks.create).not.toHaveBeenCalled();
  });
});

describe("POST /webhooks", () => {
  const constructEvent = vi.fn(
    async (body: ArrayBuffer, signature: string, secret: string) => {
      if (signature !== "good" || secret !== "whsec") throw new Error("bad");
      return JSON.parse(new TextDecoder().decode(body)) as unknown;
    },
  );

  it("verifies the raw body before calling onEvent", async () => {
    const onEvent = vi.fn();
    const { route } = handler({
      authenticate: () => null,
      webhooks: { secret: "whsec", constructEvent, onEvent },
    });
    const missing = await route.POST(post("webhooks", { body: "{}" }));
    expect(missing.status).toBe(400);
    const bad = await route.POST(
      post("webhooks", {
        body: "{}",
        headers: { "x-webhook-signature": "no" },
      }),
    );
    expect(bad.status).toBe(400);
    expect(onEvent).not.toHaveBeenCalled();
    const good = await route.POST(
      post("webhooks", {
        body: '{"id":"evt_1"}',
        headers: { "x-webhook-signature": "good" },
      }),
    );
    expect(good.status).toBe(200);
    expect(onEvent).toHaveBeenCalledWith({ id: "evt_1" });
  });
});

describe("GET /media/:id", () => {
  it("requires read_messages and the application's authorize", async () => {
    const downloadStream = vi.fn(async () => ({
      body: new Blob(["png"]).stream(),
      contentType: "image/png",
    }));
    const media = {
      downloadStream,
      downloadUrl: vi.fn(async () => ({
        streamed: true as const,
        url: undefined,
      })),
    };
    const authorize = vi.fn(async (_context: unknown, mediaId: string) =>
      mediaId === "media_1" ? { mediaId: "media_1" } : null,
    );
    const route = createPolymorfaHandler<User>({
      polymorfa: { ...sdk(), media },
      authenticate: () => ({ id: "user_1" }),
      mint: () => grant,
      media: { mode: "proxy", authorize },
    });
    const ok = await route.GET(get("media/media_1"));
    expect(ok.status).toBe(200);
    expect(ok.headers.get("content-type")).toBe("image/png");
    expect((await route.GET(get("media/media_2"))).status).toBe(403);
  });
});

describe("POST /templates", () => {
  it("lists templates behind manage_templates", async () => {
    const templates = {
      list: vi.fn(async () => ({
        data: { success: true, data: [{ id: "t1" }] },
      })),
      create: vi.fn(),
      retrieve: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
      preview: vi.fn(),
      submit: vi.fn(),
    };
    const options = {
      polymorfa: { ...sdk(), templates },
      authenticate: () => ({ id: "user_1" }),
      templates: {
        projectSlug: () => "acme",
        submissionSession: () => "cloud",
      },
    };
    const allowed = createPolymorfaHandler<User>({
      ...options,
      mint: () => ({ ...grant, allow: ["manage_templates"] }),
    });
    const response = await allowed.POST(
      post("templates", { body: JSON.stringify({ action: "list" }) }),
    );
    expect(await response.json()).toEqual({ templates: [{ id: "t1" }] });
    expect(templates.list).toHaveBeenCalledWith("acme", expect.anything());
    const denied = createPolymorfaHandler<User>({
      ...options,
      mint: () => grant,
    });
    expect(
      (
        await denied.POST(
          post("templates", { body: JSON.stringify({ action: "list" }) }),
        )
      ).status,
    ).toBe(403);
  });
});

describe("adapters", () => {
  let server: Server | undefined;
  afterEach(async () => {
    await new Promise<void>(
      (resolve) => server?.close(() => resolve()) ?? resolve(),
    );
    server = undefined;
  });

  it("serves the handler from node:http and Express with the raw body", async () => {
    const onEvent = vi.fn();
    const { route } = handler({
      webhooks: {
        secret: "whsec",
        constructEvent: async (body, signature) => {
          if (signature !== "good") throw new Error("bad");
          return JSON.parse(new TextDecoder().decode(body)) as unknown;
        },
        onEvent,
      },
      authenticate: (request) =>
        request.headers.get("cookie") === "session=1" ? { id: "user_1" } : null,
    });
    const middleware = toExpress(route);
    server = createServer(
      (request, response) => void middleware(request, response),
    );
    await new Promise<void>((resolve) =>
      server!.listen(0, "127.0.0.1", resolve),
    );
    const { port } = server.address() as AddressInfo;
    const origin = `http://127.0.0.1:${port}/api/polymorfa`;

    const anonymous = await fetch(`${origin}/token`, { method: "POST" });
    expect(anonymous.status).toBe(401);
    const signedIn = await fetch(`${origin}/token`, {
      method: "POST",
      headers: { cookie: "session=1" },
    });
    expect(signedIn.status).toBe(200);
    expect(signedIn.headers.get("cache-control")).toContain("no-store");
    expect((await signedIn.json()).grant.session).toBe("support");
    const webhook = await fetch(`${origin}/webhooks`, {
      method: "POST",
      headers: { "x-webhook-signature": "good" },
      body: '{"id":"evt_9"}',
    });
    expect(webhook.status).toBe(200);
    expect(onEvent).toHaveBeenCalledWith({ id: "evt_9" });
  });

  it("forwards errors to Express next()", async () => {
    const route = {
      GET: vi.fn(),
      POST: vi.fn(),
      handle: vi.fn(async () => {
        throw new Error("boom");
      }),
    };
    const next = vi.fn();
    const response = {
      on: vi.fn(),
      writableFinished: false,
    } as unknown as import("node:http").ServerResponse;
    await toExpress(route)(
      {
        headers: { host: "app.test" },
        method: "GET",
        url: "/api/polymorfa/events",
        socket: {},
      } as unknown as import("node:http").IncomingMessage,
      response,
      next,
    );
    expect(next).toHaveBeenCalledWith(expect.any(Error));
  });

  it("serves the handler from Hono's context", async () => {
    const { route } = handler({ authenticate: () => null });
    const response = await toHono(route)({ req: { raw: post("token") } });
    expect(response.status).toBe(401);
  });
});

describe("createDevelopmentInboxStore", () => {
  it("serves recorded webhooks as history and live events", async () => {
    const store = createDevelopmentInboxStore();
    const { route } = handler({
      history: store.history,
      events: store.events,
      mint: () => ({ ...grant, conversations: "all" }),
    });
    const message = (id: string, text: string, fromMe = false) => ({
      id: `evt_${id}`,
      session: "support",
      event: fromMe ? "message.sent" : "message.received",
      timestamp: "2026-09-19T10:00:00Z",
      payload: {
        id,
        text,
        fromMe,
        pushName: "Ada",
        timestamp: 1_789_000_000 + Number(id.slice(1)),
        conversation: { id: "chat_1", phoneNumber: "+15550001" },
      },
    });
    store.record(message("m1", "hello"));
    store.record(message("m2", "hi Ada", true));
    store.record({ not: "an event" });
    const list = await (await route.GET(get("history/conversations"))).json();
    expect(list.data).toEqual([
      {
        id: "chat_1",
        session: "support",
        name: "Ada",
        phoneNumber: "+15550001",
        lastMessage: {
          text: "hi Ada",
          createdAt: 1_789_000_002_000,
          direction: "outbound",
        },
        lastActivity: 1_789_000_002_000,
        unreadCount: 1,
      },
    ]);
    const messages = await (
      await route.GET(get("history/conversations/chat_1/messages"))
    ).json();
    expect(messages.data.map((item: { id: string }) => item.id)).toEqual([
      "m1",
      "m2",
    ]);

    const abort = new AbortController();
    const response = await route.GET(
      get("events", {
        headers: { "last-event-id": "evt_m1" },
        signal: abort.signal,
      }),
    );
    const reader = response.body!.getReader();
    const decoder = new TextDecoder();
    let text = "";
    while (!text.includes("evt_m2")) {
      const { value } = await reader.read();
      text += decoder.decode(value);
    }
    store.record(message("m3", "live"));
    while (!text.includes("evt_m3")) {
      const { value } = await reader.read();
      text += decoder.decode(value);
    }
    expect(text).not.toContain("id: evt_m1\n");
    abort.abort();
    await reader.cancel();
  });
});
