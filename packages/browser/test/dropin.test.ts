import { afterEach, describe, expect, it, vi } from "vitest";
import {
  InboxController,
  PolymorfaClient,
  connectWhatsApp,
  createHandlerInboxSource,
  type EventSourceLike,
  type PolymorfaGrant,
} from "../src/index.js";

const grant: PolymorfaGrant = {
  session: "support",
  conversations: "all",
  allow: ["read_messages", "send_message", "subscribe_events"],
};

function tokenResponse(expiresAt: number, allow = grant.allow): Response {
  return Response.json({
    value: "pmfa_ct_fixture",
    audience: "browser",
    expiresAt,
    grant: { ...grant, allow },
  });
}

/** A clock and timer queue the tests advance by hand. */
function clock(start = 1_000_000) {
  let now = start;
  const timers: { at: number; run: () => void; id: number }[] = [];
  let next = 0;
  return {
    now: () => now,
    setTimeout: (run: () => void, ms: number) => {
      const id = ++next;
      timers.push({ at: now + ms, run, id });
      return id;
    },
    clearTimeout: (id: unknown) => {
      const index = timers.findIndex((timer) => timer.id === id);
      if (index >= 0) timers.splice(index, 1);
    },
    pending: () => timers.map((timer) => timer.at - now),
    async advance(ms: number) {
      now += ms;
      for (;;) {
        timers.sort((a, b) => a.at - b.at);
        const due = timers[0];
        if (due === undefined || due.at > now) break;
        timers.shift();
        due.run();
        await flush();
      }
    },
  };
}

async function flush() {
  for (let index = 0; index < 10; index += 1) await Promise.resolve();
}

describe("PolymorfaClient token refresh", () => {
  it("POSTs to the token endpoint and exposes the grant", async () => {
    const time = clock();
    const fetch = vi.fn(async () => tokenResponse(time.now() + 600_000));
    const client = new PolymorfaClient({ fetch, ...time });
    client.start();
    await flush();
    expect(fetch).toHaveBeenCalledWith("/api/polymorfa/token", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
    expect(client.getSnapshot()).toMatchObject({ status: "ready", grant });
    expect(client.can("send_message")).toBe(true);
    expect(client.can("voip_place")).toBe(false);
    expect(client.canRead("chat_1")).toBe(true);
    expect(client.handlerPath).toBe("/api/polymorfa");
    expect((await client.getClientToken()).value).toBe("pmfa_ct_fixture");
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("refreshes 60 s before expiry, or at 80 % of a short lifetime", async () => {
    const time = clock();
    let lifetime = 600_000;
    const fetch = vi.fn(async () => tokenResponse(time.now() + lifetime));
    const client = new PolymorfaClient({ fetch, ...time });
    client.start();
    await flush();
    expect(time.pending()).toEqual([540_000]);
    lifetime = 100_000;
    await time.advance(539_999);
    expect(fetch).toHaveBeenCalledTimes(1);
    await time.advance(1);
    expect(fetch).toHaveBeenCalledTimes(2);
    // A 100 s token refreshes after 80 s, not 40 s.
    expect(time.pending()).toEqual([80_000]);
  });

  it("backs off exponentially with jitter, capped, then recovers", async () => {
    const time = clock();
    let failures = 5;
    const fetch = vi.fn(async () =>
      failures-- > 0
        ? new Response("upstream", { status: 503 })
        : tokenResponse(time.now() + 600_000),
    );
    const client = new PolymorfaClient({
      fetch,
      random: () => 1,
      maxBackoffMs: 8_000,
      ...time,
    });
    client.start();
    await flush();
    const delays: number[] = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      expect(client.getSnapshot().status).toBe("retrying");
      const [delay] = time.pending();
      delays.push(delay!);
      await time.advance(delay!);
    }
    expect(delays).toEqual([1_000, 2_000, 4_000, 8_000, 8_000]);
    expect(client.getSnapshot()).toMatchObject({
      status: "ready",
      failures: 0,
    });
  });

  it("uses equal jitter between half and all of the ceiling", async () => {
    const time = clock();
    const fetch = vi.fn(async () => new Response("", { status: 502 }));
    const client = new PolymorfaClient({ fetch, random: () => 0, ...time });
    client.start();
    await flush();
    expect(time.pending()).toEqual([500]);
  });

  it("stops retrying after 401 until asked again", async () => {
    const time = clock();
    const fetch = vi.fn(async () =>
      Response.json(
        { error: { code: "unauthenticated", message: "Sign in to continue." } },
        { status: 401 },
      ),
    );
    const client = new PolymorfaClient({ fetch, ...time });
    client.start();
    await flush();
    expect(client.getSnapshot()).toMatchObject({
      status: "unauthenticated",
      error: "Sign in to continue.",
    });
    expect(time.pending()).toEqual([]);
    await expect(client.refresh()).rejects.toMatchObject({ status: 401 });
    expect(fetch).toHaveBeenCalledTimes(2);
  });

  it("turns an HTML proxy page into a clear error", async () => {
    const time = clock();
    const fetch = vi.fn(
      async () =>
        new Response("<html>Bad gateway</html>", {
          status: 200,
          headers: { "content-type": "text/html" },
        }),
    );
    const client = new PolymorfaClient({ fetch, ...time });
    await expect(client.refresh()).rejects.toThrow(
      /text\/html instead of JSON/,
    );
  });

  it("rejects a token route that returns no grant", async () => {
    const time = clock();
    const fetch = vi.fn(async () =>
      Response.json({
        value: "pmfa_ct_x",
        audience: "browser",
        expiresAt: time.now() + 60_000,
      }),
    );
    const client = new PolymorfaClient({ fetch, ...time });
    await expect(client.refresh()).rejects.toThrow(/createPolymorfaHandler/);
  });

  it("shares one fetch between concurrent token requests", async () => {
    const time = clock();
    const fetch = vi.fn(async () => tokenResponse(time.now() + 600_000));
    const client = new PolymorfaClient({ fetch, ...time });
    await Promise.all([client.getClientToken(), client.getClientToken()]);
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it("rejects cross-origin token endpoints", () => {
    expect(
      () => new PolymorfaClient({ tokenEndpoint: "https://evil.test/token" }),
    ).toThrow(/same-origin/);
  });

  it("stops refreshing after dispose", async () => {
    const time = clock();
    const fetch = vi.fn(async () => tokenResponse(time.now() + 600_000));
    const client = new PolymorfaClient({ fetch, ...time });
    client.start();
    await flush();
    client.dispose();
    expect(time.pending()).toEqual([]);
  });
});

class FakeEventSource implements EventSourceLike {
  static instances: FakeEventSource[] = [];
  readonly listeners = new Map<string, ((event: { data: string }) => void)[]>();
  closed = false;
  constructor(readonly url: string) {
    FakeEventSource.instances.push(this);
  }
  addEventListener(type: string, listener: (event: { data: string }) => void) {
    this.listeners.set(type, [...(this.listeners.get(type) ?? []), listener]);
  }
  close() {
    this.closed = true;
  }
  emit(value: unknown) {
    for (const listener of this.listeners.get("message") ?? [])
      listener({ data: JSON.stringify(value) });
  }
}

describe("createHandlerInboxSource", () => {
  afterEach(() => {
    FakeEventSource.instances = [];
  });

  async function readyClient(
    routes: Record<string, () => Response>,
    allow = grant.allow,
  ) {
    const time = clock();
    const fetch = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url === "/api/polymorfa/token")
        return tokenResponse(time.now() + 600_000, allow);
      const route = routes[url];
      if (route === undefined) throw new Error(`unexpected ${url}`);
      return route();
    });
    const client = new PolymorfaClient({ fetch, ...time });
    await client.refresh();
    return { client, fetch };
  }

  it("lists conversations and pages messages through the handler", async () => {
    const { client } = await readyClient({
      "/api/polymorfa/history/conversations": () =>
        Response.json({
          data: [
            { id: "chat_1", lastActivity: 1, unreadCount: 0 },
            { id: "chat_2", lastActivity: 5, unreadCount: 2 },
          ],
          nextCursor: "c2",
        }),
      "/api/polymorfa/history/conversations/chat_1/messages": () =>
        Response.json({
          data: [
            {
              id: "m1",
              text: "hi",
              createdAt: 1,
              direction: "inbound",
              status: "sent",
            },
          ],
          nextCursor: null,
        }),
    });
    const inbox = new InboxController(
      createHandlerInboxSource(client, { EventSource: FakeEventSource }),
    );
    await inbox.load();
    expect(inbox.getSnapshot()).toMatchObject({
      status: "ready",
      hasMore: true,
      cursor: "c2",
    });
    expect(inbox.getSnapshot().conversations.map(({ id }) => id)).toEqual([
      "chat_2",
      "chat_1",
    ]);
    const conversation = inbox.conversation(
      inbox.getSnapshot().conversations[1]!,
    );
    await vi.waitFor(() =>
      expect(conversation.getSnapshot().messages.map(({ id }) => id)).toEqual([
        "m1",
      ]),
    );
    inbox.dispose();
  });

  it("applies relayed events to the list and the open conversation", async () => {
    const { client } = await readyClient({
      "/api/polymorfa/history/conversations": () =>
        Response.json({
          data: [
            { id: "chat_1", name: "Ada", lastActivity: 1, unreadCount: 0 },
          ],
        }),
      "/api/polymorfa/history/conversations/chat_1/messages": () =>
        Response.json({ data: [] }),
    });
    const inbox = new InboxController(
      createHandlerInboxSource(client, { EventSource: FakeEventSource }),
    );
    await inbox.load();
    const conversation = inbox.conversation(
      inbox.getSnapshot().conversations[0]!,
    );
    await vi.waitFor(() =>
      expect(conversation.getSnapshot().status).toBe("ready"),
    );
    expect(FakeEventSource.instances).toHaveLength(1);
    expect(FakeEventSource.instances[0]!.url).toBe("/api/polymorfa/events");
    FakeEventSource.instances[0]!.emit({
      id: "e1",
      session: "support",
      event: "message.received",
      timestamp: "2026-09-19T10:00:00.000Z",
      payload: {
        id: "m9",
        text: "new",
        conversation: { id: "chat_1" },
        pushName: "Someone else",
      },
    });
    expect(inbox.getSnapshot().conversations[0]).toMatchObject({
      id: "chat_1",
      name: "Ada",
      unreadCount: 1,
      lastMessage: { text: "new", direction: "inbound" },
    });
    expect(conversation.getSnapshot().messages.map(({ id }) => id)).toEqual([
      "m9",
    ]);
    inbox.select("chat_1");
    expect(inbox.getSnapshot().conversations[0]!.unreadCount).toBe(0);
    inbox.dispose();
    expect(FakeEventSource.instances[0]!.closed).toBe(true);
  });

  it("does not open the events stream without subscribe_events", async () => {
    const { client } = await readyClient(
      {
        "/api/polymorfa/history/conversations": () =>
          Response.json({ data: [] }),
      },
      ["read_messages"],
    );
    const inbox = new InboxController(
      createHandlerInboxSource(client, { EventSource: FakeEventSource }),
    );
    await inbox.load();
    expect(FakeEventSource.instances).toHaveLength(0);
  });

  it("reports a missing contact as undefined", async () => {
    const { client } = await readyClient({
      "/api/polymorfa/history/conversations/chat_1/contact": () =>
        Response.json(
          { error: { code: "not_found", message: "Contact not found." } },
          { status: 404 },
        ),
    });
    const source = createHandlerInboxSource(client);
    expect(
      await source.contact!({ id: "chat_1", lastActivity: 0, unreadCount: 0 }),
    ).toBeUndefined();
  });
});

describe("connectWhatsApp", () => {
  it("creates the QuickLink through the handler and opens the hosted URL", async () => {
    const time = clock();
    const fetch = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        if (String(input) === "/api/polymorfa/connect") {
          expect(init?.method).toBe("POST");
          return Response.json({
            data: {
              id: "ql_1",
              url: "https://link.polymorfa.com/ql_1",
              expiresAt: null,
            },
          });
        }
        return tokenResponse(time.now() + 600_000);
      },
    );
    const client = new PolymorfaClient({ fetch, ...time });
    const open = vi.fn();
    const result = await connectWhatsApp(client, { open });
    expect(result).toEqual({
      id: "ql_1",
      url: "https://link.polymorfa.com/ql_1",
      expiresAt: null,
    });
    expect(open).toHaveBeenCalledWith("https://link.polymorfa.com/ql_1");
  });

  it("refuses a non-HTTPS link", async () => {
    const fetch = vi.fn(async () =>
      Response.json({ data: { id: "ql_1", url: "javascript:alert(1)" } }),
    );
    const client = new PolymorfaClient({ fetch });
    const open = vi.fn();
    await expect(connectWhatsApp(client, { open })).rejects.toThrow(
      /invalid QuickLink/,
    );
    expect(open).not.toHaveBeenCalled();
  });

  it("surfaces the handler's refusal", async () => {
    const fetch = vi.fn(async () =>
      Response.json(
        {
          error: {
            code: "permission_missing",
            message: 'The grant lacks "connect_whatsapp".',
          },
        },
        { status: 403 },
      ),
    );
    const client = new PolymorfaClient({ fetch });
    await expect(
      connectWhatsApp(client, { open: vi.fn() }),
    ).rejects.toMatchObject({ status: 403, code: "permission_missing" });
  });
});
