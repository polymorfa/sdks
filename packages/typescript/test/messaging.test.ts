import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, it } from "vitest";

import { MessagingClient } from "../src/messaging/client.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function messagingServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_messaging",
    },
    body: '{"success":true,"data":{},"message":"accepted","operationId":"op_1"}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: {
        type: "apiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient sessions", () => {
  it("lists and creates sessions using the current routes", async () => {
    const { client, requests } = await messagingServer();
    await client.sessions.list();
    const created = await client.sessions.create(
      { projectId: "project_1", sessionId: "support", start: true },
      { idempotencyKey: "session-support" },
    );

    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/messaging/sessions",
      body: "",
    });
    expect(requests[1]).toMatchObject({
      method: "POST",
      path: "/messaging/sessions",
      body: '{"projectId":"project_1","sessionId":"support","start":true}',
    });
    expect(requests[1]?.headers["idempotency-key"]).toBe("session-support");
    expect(created.metadata.requestId).toBe("req_messaging");
  });

  it("encodes session identifiers for lifecycle and account operations", async () => {
    const { client, requests } = await messagingServer();
    const id = "support/eu";
    await client.sessions.retrieve(id);
    await client.sessions.update(id, { config: { presence: true } });
    await client.sessions.start(id);
    await client.sessions.stop(id);
    await client.sessions.restart(id);
    await client.sessions.logout(id);
    await client.sessions.delete(id);
    await client.sessions.account(id);

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /messaging/sessions/support%2Feu",
      "PUT /messaging/sessions/support%2Feu",
      "POST /messaging/sessions/support%2Feu/start",
      "POST /messaging/sessions/support%2Feu/stop",
      "POST /messaging/sessions/support%2Feu/restart",
      "POST /messaging/sessions/support%2Feu/logout",
      "DELETE /messaging/sessions/support%2Feu",
      "GET /messaging/sessions/support%2Feu/me",
    ]);
    expect(requests[1]?.body).toBe('{"config":{"presence":true}}');
  });

  it("retrieves JSON pairing data and requests a phone pairing code", async () => {
    const { client, requests } = await messagingServer();

    const qr = await client.sessions.qr("support/eu", { timeoutMs: 5_000 });
    await client.sessions.requestPairingCode(
      "support/eu",
      { phone: "+15551234567" },
      { idempotencyKey: "pair-support-phone" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /messaging/support%2Feu/pair/qr?format=json",
      "POST /messaging/support%2Feu/pair/code",
    ]);
    expect(qr.metadata.requestId).toBe("req_messaging");
    expect(requests[1]?.body).toBe('{"phone":"+15551234567"}');
    expect(requests[1]?.headers["idempotency-key"]).toBe("pair-support-phone");
  });
});

describe("MessagingClient operations", () => {
  it("retrieves a durable lifecycle operation with an encoded identifier", async () => {
    const { client, requests } = await messagingServer();

    await client.operations.retrieve("operation/123", { apiVersion: "next" });

    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/messaging/operations/operation%2F123",
    });
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
  });
});

describe("MessagingClient messages", () => {
  it("sends messages and exposes the typed response envelope", async () => {
    const { client, requests } = await messagingServer();
    const response = await client.messages.send(
      "support/eu",
      { chatId: "15551234567@s.whatsapp.net", type: "text", text: "Hello" },
      { idempotencyKey: "message-1" },
    );

    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/messaging/support%2Feu/messages/send",
      body: '{"chatId":"15551234567@s.whatsapp.net","type":"text","text":"Hello"}',
    });
    expect(response.data.success).toBe(true);
  });

  it("maps seen, typing, reaction, and star actions", async () => {
    const { client, requests } = await messagingServer();
    await client.messages.markSeen("support", {
      chatId: "chat",
      messageId: "m1",
    });
    await client.messages.setTyping("support", {
      chatId: "chat",
      state: "recording",
    });
    await client.messages.react("support", {
      chatId: "chat",
      messageId: "m1",
      reaction: "👍",
    });
    await client.messages.star("support", {
      chatId: "chat",
      messageId: "m1",
      star: true,
    });

    expect(requests.map(({ path }) => path)).toEqual([
      "/messaging/support/messages/seen",
      "/messaging/support/messages/typing",
      "/messaging/support/messages/react",
      "/messaging/support/messages/star",
    ]);
    expect(requests[1]?.body).toBe('{"chatId":"chat","state":"recording"}');
  });
});

describe("MessagingClient client tokens", () => {
  it("mints tokens and manages session-bound rules", async () => {
    const { client, requests } = await messagingServer();

    await client.clientTokens.mint(
      {
        session: "support/eu",
        ephemeralId: "user-1-tab-2",
        ttlSeconds: 600,
      },
      { idempotencyKey: "browser-user-1-tab-2" },
    );
    await client.clientTokens.retrieveRules("support/eu");
    await client.clientTokens.updateRules("support/eu", {
      recipientMode: "conversation",
      allowedActions: "send_message,send_reaction",
      rateLimit: 20,
      maxDaily: 200,
      allowedOrigins: "https://app.example.test",
      enabled: true,
    });
    await client.clientTokens.deleteRules("support/eu");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /messaging/client-tokens",
      "GET /messaging/sessions/support%2Feu/client-rules",
      "PUT /messaging/sessions/support%2Feu/client-rules",
      "DELETE /messaging/sessions/support%2Feu/client-rules",
    ]);
    expect(requests[0]?.body).toBe(
      '{"session":"support/eu","ephemeralId":"user-1-tab-2","ttlSeconds":600}',
    );
    expect(requests[0]?.headers["idempotency-key"]).toBe(
      "browser-user-1-tab-2",
    );
    expect(requests[2]?.body).toBe(
      '{"recipientMode":"conversation","allowedActions":"send_message,send_reaction","rateLimit":20,"maxDaily":200,"allowedOrigins":"https://app.example.test","enabled":true}',
    );
  });
});

describe("MessagingClient contacts", () => {
  it("maps the complete contact directory and metadata read surface", async () => {
    const { client, requests } = await messagingServer();
    const session = "support/eu";
    const contactId = "15551234567/1@lid";

    await client.contacts.list(session);
    await client.contacts.check(session, ["+15551234567", "+15557654321"]);
    await client.contacts.blocklist(session);
    await client.contacts.retrieve(session, contactId);
    await client.contacts.picture(session, contactId);
    await client.contacts.info(session, contactId);
    await client.contacts.devices(session, contactId);
    await client.contacts.businessProfile(session, contactId);

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /messaging/support%2Feu/contacts",
      "GET /messaging/support%2Feu/contacts/check?phone=%2B15551234567%2C%2B15557654321",
      "GET /messaging/support%2Feu/contacts/blocked",
      "GET /messaging/support%2Feu/contacts/15551234567%2F1%40lid",
      "GET /messaging/support%2Feu/contacts/15551234567%2F1%40lid/picture",
      "GET /messaging/support%2Feu/contacts/15551234567%2F1%40lid/info",
      "GET /messaging/support%2Feu/contacts/15551234567%2F1%40lid/devices",
      "GET /messaging/support%2Feu/contacts/15551234567%2F1%40lid/business-profile",
    ]);
  });

  it("maps block and unblock mutations without putting contact data in a body", async () => {
    const { client, requests } = await messagingServer();
    const contactId = "15551234567@lid";

    await client.contacts.block("support", contactId, {
      idempotencyKey: "block-contact-1",
    });
    await client.contacts.unblock("support", contactId, {
      idempotencyKey: "unblock-contact-1",
    });

    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "POST",
        path: "/messaging/support/contacts/15551234567%40lid/block",
        body: "",
      },
      {
        method: "POST",
        path: "/messaging/support/contacts/15551234567%40lid/unblock",
        body: "",
      },
    ]);
    expect(requests[0]?.headers["idempotency-key"]).toBe("block-contact-1");
    expect(requests[1]?.headers["idempotency-key"]).toBe("unblock-contact-1");
  });
});

describe("MessagingClient chats", () => {
  it("maps message editing and deletion with fully encoded identifiers", async () => {
    const { client, requests } = await messagingServer();
    const session = "support/eu";
    const chatId = "15551234567@g.us/team";
    const messageId = "message/1";

    await client.chats.editMessage(
      session,
      chatId,
      messageId,
      { text: "Corrected copy" },
      { idempotencyKey: "edit-message-1" },
    );
    await client.chats.deleteMessage(session, chatId, messageId, {
      idempotencyKey: "delete-message-1",
    });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PUT /messaging/support%2Feu/chats/15551234567%40g.us%2Fteam/messages/message%2F1",
      "DELETE /messaging/support%2Feu/chats/15551234567%40g.us%2Fteam/messages/message%2F1",
    ]);
    expect(requests[0]?.body).toBe('{"text":"Corrected copy"}');
    expect(requests[0]?.headers["idempotency-key"]).toBe("edit-message-1");
    expect(requests[1]?.headers["idempotency-key"]).toBe("delete-message-1");
  });

  it("maps archive state and the exact disappearing-message durations", async () => {
    const { client, requests } = await messagingServer();
    const session = "support";
    const chatId = "15551234567@s.whatsapp.net";

    await client.chats.archive(session, chatId, {
      idempotencyKey: "archive-chat-1",
    });
    await client.chats.unarchive(session, chatId, {
      idempotencyKey: "unarchive-chat-1",
    });
    await client.chats.setDisappearingTimer(
      session,
      chatId,
      { durationSeconds: 604800 },
      { idempotencyKey: "chat-timer-1" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /messaging/support/chats/15551234567%40s.whatsapp.net/archive",
      "POST /messaging/support/chats/15551234567%40s.whatsapp.net/unarchive",
      "PUT /messaging/support/chats/15551234567%40s.whatsapp.net/disappearing",
    ]);
    expect(requests[2]?.body).toBe('{"durationSeconds":604800}');
    expect(requests.map(({ headers }) => headers["idempotency-key"])).toEqual([
      "archive-chat-1",
      "unarchive-chat-1",
      "chat-timer-1",
    ]);
  });
});

describe("MessagingClient templates", () => {
  it("maps canonical project-template CRUD, preview, and submission operations", async () => {
    const { client, requests } = await messagingServer();
    const definition = {
      version: 1 as const,
      kind: "standard" as const,
      category: "UTILITY" as const,
      language: "en_US",
      header: { format: "text" as const, text: "Order {{order_id}}" },
      body: "Hello {{name}}, your order is ready.",
      buttons: [
        {
          type: "url" as const,
          text: "Track order",
          url: "https://example.test/orders/{{order_id}}",
        },
      ],
      variables: [
        { name: "order_id", type: "text" as const, example: "A-100" },
        { name: "name", type: "text" as const, example: "Ada" },
      ],
    };

    await client.templates.list("support/eu");
    await client.templates.create(
      "support/eu",
      {
        name: "order_ready",
        definition,
        sampleValues: { order_id: "A-100", name: "Ada" },
      },
      { idempotencyKey: "template-order-ready" },
    );
    await client.templates.retrieve("support/eu", "template/1");
    await client.templates.update("support/eu", "template/1", {
      status: "draft",
      definition: { ...definition, footer: "Reply STOP to opt out" },
    });
    await client.templates.delete("support/eu", "template/1");
    await client.templates.preview("support/eu", "template/1", {
      values: { name: "Grace", order_id: "A-200" },
      surface: "sandbox",
    });
    await client.templates.submit("support/eu", "template/1", {
      session: "cloud/support",
    });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /messaging/projects/support%2Feu/templates",
      "POST /messaging/projects/support%2Feu/templates",
      "GET /messaging/projects/support%2Feu/templates/template%2F1",
      "PATCH /messaging/projects/support%2Feu/templates/template%2F1",
      "DELETE /messaging/projects/support%2Feu/templates/template%2F1",
      "POST /messaging/projects/support%2Feu/templates/template%2F1/preview",
      "POST /messaging/projects/support%2Feu/templates/template%2F1/submit",
    ]);
    expect(requests[1]?.headers["idempotency-key"]).toBe(
      "template-order-ready",
    );
    expect(requests[1]?.body).toBe(
      JSON.stringify({
        name: "order_ready",
        definition,
        sampleValues: { order_id: "A-100", name: "Ada" },
      }),
    );
    expect(requests[5]?.body).toBe(
      '{"values":{"name":"Grace","order_id":"A-200"},"surface":"sandbox"}',
    );
    expect(requests[6]?.body).toBe('{"session":"cloud/support"}');
  });
});

describe("MessagingClient webhooks", () => {
  it("maps webhook CRUD operations without exposing the HMAC key in URLs", async () => {
    const { client, requests } = await messagingServer();
    await client.webhooks.list();
    await client.webhooks.create({
      session: "support",
      url: "https://example.test/hooks",
      events: ["message.received"],
      hmacKey: "fixture-secret",
    });
    await client.webhooks.retrieve("hook/a");
    await client.webhooks.update("hook/a", { enabled: false });
    await client.webhooks.delete("hook/a");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /messaging/webhooks",
      "POST /messaging/webhooks",
      "GET /messaging/webhooks/hook%2Fa",
      "PUT /messaging/webhooks/hook%2Fa",
      "DELETE /messaging/webhooks/hook%2Fa",
    ]);
    expect(requests[1]?.body).toContain('"hmacKey":"fixture-secret"');
    expect(requests.every(({ path }) => !path.includes("fixture-secret"))).toBe(
      true,
    );
  });

  it("uses a client token only when its discriminator matches", async () => {
    const server = await startTestServer(() => ({
      body: '{"success":true,"data":[]}',
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "clientToken", value: "pmfa_ct_widget" },
      baseUrl: server.url,
    });
    await client.sessions.list();
    expect(server.requests[0]?.headers.authorization).toBe(
      "Bearer pmfa_ct_widget",
    );
  });
});
