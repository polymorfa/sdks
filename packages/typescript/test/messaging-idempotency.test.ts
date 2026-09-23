import { afterEach, describe, expect, it } from "vitest";

import { MessagingClient, PolymorfaServerError } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import {
  startTestServer,
  type TestResponse,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function clientFor(
  respond: (index: number) => TestResponse,
  maxNetworkRetries = 0,
): Promise<{ client: MessagingClient; server: TestServer }> {
  const server = await startTestServer((_request, index) => respond(index));
  servers.push(server);
  return {
    server,
    client: new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries,
    }),
  };
}

const ok: TestResponse = {
  status: 200,
  headers: { "content-type": "application/json" },
  body: '{"success":true,"data":{}}',
};
const text = {
  conversation: { phoneNumber: "+15550001111" },
  content: { text: "hello" },
} as const;
const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

describe("Idempotency-Key on messaging writes", () => {
  it("adds a fresh key to every eligible write", async () => {
    const { client, server } = await clientFor(() => ok);
    await client.messages.send("support", text);
    await client.messages.send("support", text);
    await client.messages.react("support", {
      conversation: { id: "739182640518203" },
      id: "739182640518204",
      reaction: "👍",
    });
    await client.chats.editMessage("support", "chat", "message", {
      content: { text: "edited" },
    } as never);
    await client.chats.deleteMessage("support", "chat", "message");
    await client.channels.reactToMessage("support", "channel", "message", {
      reaction: "👍",
    } as never);
    await client.campaigns.create("project", { name: "August" } as never);
    await client.campaigns.launch("project", "campaign");

    const keys = server.requests.map(
      ({ headers }) => headers["idempotency-key"],
    );
    expect(keys).toHaveLength(8);
    for (const key of keys) expect(key).toMatch(UUID);
    expect(new Set(keys).size).toBe(8);
  });

  it("keeps a caller-supplied key", async () => {
    const { client, server } = await clientFor(() => ok);
    await client.messages.send("support", text, {
      idempotencyKey: "order-42-shipped",
    });
    expect(server.requests[0]?.headers["idempotency-key"]).toBe(
      "order-42-shipped",
    );
  });

  it("does not add a key to seen, typing, or star", async () => {
    const { client, server } = await clientFor(() => ok);
    await client.messages.markSeen("support", {
      conversation: { id: "739182640518203" },
      id: "739182640518204",
    });
    await client.messages.setTyping("support", {
      conversation: { id: "739182640518203" },
      state: "typing",
    });
    expect(
      server.requests.every(
        ({ headers }) => headers["idempotency-key"] === undefined,
      ),
    ).toBe(true);
  });

  it("retries a send with the same key", async () => {
    const { client, server } = await clientFor(
      (index) =>
        index === 0
          ? {
              status: 503,
              headers: {
                "content-type": "application/json",
                "retry-after": "0",
              },
              body: '{"error":{"code":"session_not_ready"}}',
            }
          : ok,
      2,
    );
    const response = await client.messages.send("support", text);
    expect(response.metadata.attempts).toBe(2);
    const [first, second] = server.requests.map(
      ({ headers }) => headers["idempotency-key"],
    );
    expect(first).toMatch(UUID);
    expect(second).toBe(first);
  });

  it("stops retrying once the API replays a recorded failure", async () => {
    const { client, server } = await clientFor(
      () => ({
        status: 504,
        headers: {
          "content-type": "application/json",
          "retry-after": "0",
          "idempotent-replayed": "true",
        },
        body: '{"error":{"code":"result_unknown"}}',
      }),
      3,
    );
    await expect(client.messages.send("support", text)).rejects.toBeInstanceOf(
      PolymorfaServerError,
    );
    expect(server.requests).toHaveLength(1);
  });
});
