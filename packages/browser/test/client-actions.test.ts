import { describe, expect, it, vi } from "vitest";

import {
  BrowserConfigurationError,
  BrowserMessagingClient,
  createBrowserComposerActions,
} from "../src/index.js";

describe("BrowserMessagingClient", () => {
  it("binds message actions to one encoded session", async () => {
    const requests: Array<{
      url: string;
      init: RequestInit | undefined;
    }> = [];
    const client = new BrowserMessagingClient({
      session: "support/eu",
      getClientToken: async () => "pmfa_ct_fixture",
      baseUrl: "https://api.example.test",
      maxNetworkRetries: 0,
      fetch: vi.fn(async (url, init) => {
        requests.push({ url: String(url), init });
        return Response.json({ success: true, data: {} });
      }),
    });

    await client.messages.send(
      { chatId: "15551234567@s.whatsapp.net", type: "text", text: "Hello" },
      { idempotencyKey: "message-1" },
    );
    await client.messages.markSeen({ chatId: "chat", messageId: "m1" });
    await client.messages.setTyping({ chatId: "chat", state: "typing" });
    await client.messages.react({
      chatId: "chat",
      messageId: "m1",
      reaction: "👍",
    });
    await client.messages.star({ chatId: "chat", messageId: "m1", star: true });

    expect(
      requests.map(
        ({ url, init }) => `${init?.method} ${new URL(url).pathname}`,
      ),
    ).toEqual([
      "POST /api/support%2Feu/messages/send",
      "POST /api/support%2Feu/messages/seen",
      "POST /api/support%2Feu/messages/typing",
      "POST /api/support%2Feu/messages/react",
      "POST /api/support%2Feu/messages/star",
    ]);
    expect(new Headers(requests[0]?.init?.headers).get("idempotency-key")).toBe(
      "message-1",
    );
  });

  it("maps the exact presence and contact read allowlist", async () => {
    const urls: string[] = [];
    const client = new BrowserMessagingClient({
      session: "support",
      getClientToken: async () => "pmfa_ct_fixture",
      baseUrl: "https://api.example.test",
      fetch: async (url) => {
        urls.push(String(url));
        return Response.json({ success: true, data: {} });
      },
    });

    await client.presence.retrieve();
    await client.presence.retrieveChat("1555@s.whatsapp.net");
    await client.presence.subscribe("1555@s.whatsapp.net");
    await client.contacts.list();
    await client.contacts.retrieve("1555@s.whatsapp.net");
    await client.contacts.picture("1555@s.whatsapp.net");
    await client.contacts.check(["+15550001", "+15550002"]);

    expect(urls.map((url) => new URL(url).pathname)).toEqual([
      "/api/support/presence",
      "/api/support/presence/1555%40s.whatsapp.net",
      "/api/support/presence/1555%40s.whatsapp.net/subscribe",
      "/api/support/contacts",
      "/api/support/contacts/1555%40s.whatsapp.net",
      "/api/support/contacts/1555%40s.whatsapp.net/picture",
      "/api/support/contacts/check",
    ]);
    expect(new URL(urls[6] ?? "").searchParams.get("phone")).toBe(
      "+15550001,+15550002",
    );
  });

  it("maps client-token widget actions without adding undocumented routes", async () => {
    const requests: Array<{
      url: string;
      init: RequestInit | undefined;
    }> = [];
    const client = new BrowserMessagingClient({
      session: "widget-1",
      getClientToken: async () => "pmfa_ct_fixture",
      baseUrl: "https://api.example.test",
      fetch: async (url, init) => {
        requests.push({ url: String(url), init });
        return Response.json({ success: true, data: {} });
      },
    });

    await client.widget.start();
    await client.widget.status();
    await client.widget.qr();
    await client.widget.requestPairingCode({ phone: "+15550001" });
    await client.widget.handoff();

    expect(
      requests.map(
        ({ url, init }) => `${init?.method} ${new URL(url).pathname}`,
      ),
    ).toEqual([
      "POST /api/sessions/widget-1/start",
      "GET /api/sessions/widget-1",
      "GET /api/widget-1/pair/qr",
      "POST /api/widget-1/pair/code",
      "POST /api/widget/sessions/widget-1/handoff",
    ]);
    expect(requests[3]?.init?.body).toBe('{"phone":"+15550001"}');
  });

  it("adapts text composer sends while keeping uploads application-owned", async () => {
    const bodies: string[] = [];
    const client = new BrowserMessagingClient({
      session: "support",
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: async (url, init) => {
        void url;
        bodies.push(String(init?.body));
        return Response.json({ success: true, data: {} });
      },
    });
    const actions = createBrowserComposerActions({
      messages: client.messages,
      chatId: "1555@s.whatsapp.net",
    });

    await actions.send(
      { text: "Reply", replyTo: "message-1", attachments: [] },
      new AbortController().signal,
    );
    expect(bodies).toEqual([
      '{"chatId":"1555@s.whatsapp.net","type":"text","text":"Reply","quotedMessage":{"id":"message-1"}}',
    ]);

    await expect(
      actions.upload(
        {
          id: "local-1",
          name: "photo.png",
          size: 100,
          contentType: "image/png",
        },
        () => undefined,
        new AbortController().signal,
      ),
    ).rejects.toBeInstanceOf(BrowserConfigurationError);
  });
});
