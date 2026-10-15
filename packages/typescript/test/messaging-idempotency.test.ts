import { afterEach, describe, expect, it } from "vitest";

import { Client, MessagingClient, PolymorfaServerError } from "../src/index.js";
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

  it.each([
    ["messaging", "Idempotency-Key"],
    ["messaging", "idempotency-key"],
    ["messaging", "IDEMPOTENCY-KEY"],
    ["project", "Idempotency-Key"],
    ["project", "idempotency-key"],
    ["project", "IDEMPOTENCY-KEY"],
    ["organization", "Idempotency-Key"],
    ["organization", "idempotency-key"],
    ["organization", "IDEMPOTENCY-KEY"],
  ])(
    "preserves the %s caller's %s across repeated test sends and retries",
    async (kind, casing) => {
      const { client, server } = await clientFor(
        (index) =>
          index % 2 === 0
            ? {
                status: 503,
                headers: {
                  "content-type": "application/json",
                  "retry-after": "0",
                },
                body: '{"error":{"code":"service_unavailable"}}',
              }
            : {
                ...ok,
                body: JSON.stringify({
                  success: true,
                  data: {
                    id: "018f0000-0000-7000-8000-000000000001",
                    campaignId: "018f0000-0000-7000-8000-000000000002",
                    status: "sent",
                    from: {
                      sessionId: "018f0000-0000-7000-8000-000000000003",
                      phone: "+15550001111",
                    },
                    to: "+15550001112",
                    messageId: null,
                    variables: {},
                    createdAt: 0,
                  },
                }),
              },
        1,
      );
      const options = Object.freeze({
        headers: Object.freeze({ [casing!]: "caller-fixed" }),
        maxNetworkRetries: 1,
      });
      const projectId = "018f0000-0000-7000-8000-000000000004";
      const campaignId = "018f0000-0000-7000-8000-000000000002";
      const body = {
        sessionId: "018f0000-0000-7000-8000-000000000003",
        to: "+15550001112",
        variables: {},
      };
      const organization = new Client({
        credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
        baseUrl: server.url,
      });
      for (let call = 0; call < 2; call++) {
        if (kind === "messaging")
          await client.campaigns.testSend("project", campaignId, body, options);
        else if (kind === "organization")
          await organization.campaigns.testSend(
            campaignId,
            { ...body, projectId },
            options,
          );
        else
          await organization
            .project(projectId)
            .campaigns.testSend(campaignId, body, options);
      }
      expect(
        server.requests.map(({ headers }) => headers["idempotency-key"]),
      ).toEqual([
        "caller-fixed",
        "caller-fixed",
        "caller-fixed",
        "caller-fixed",
      ]);
      const path =
        kind === "messaging"
          ? `/messaging/projects/project/campaigns/${campaignId}/test-send`
          : `/platform/campaigns/${campaignId}/test-send`;
      expect(
        server.requests.every(
          (request) => request.method === "POST" && request.path === path,
        ),
      ).toBe(true);
      expect(new Set(server.requests.map(({ body }) => body)).size).toBe(1);
      expect(options.headers).toEqual({ [casing!]: "caller-fixed" });
    },
  );

  it("collapses equal aliases and gives the explicit option precedence without mutating headers", async () => {
    const { client, server } = await clientFor(() => ok);
    const headers = Object.freeze({
      "idempotency-key": "first",
      "IDEMPOTENCY-KEY": "second",
      "x-caller": "preserved",
    });
    await client.messages.send("support", text, {
      headers,
      idempotencyKey: "explicit",
    });
    await client.messages.send("support", text, {
      headers: { "Idempotency-Key": "same", "idempotency-key": "same" },
    });
    expect(
      server.requests.map(({ headers }) => headers["idempotency-key"]),
    ).toEqual(["explicit", "same"]);
    expect(server.requests[0]?.headers["x-caller"]).toBe("preserved");
    expect(headers).toEqual({
      "idempotency-key": "first",
      "IDEMPOTENCY-KEY": "second",
      "x-caller": "preserved",
    });
  });

  it.each([
    { "idempotency-key": "first", "Idempotency-Key": "second" },
    { "Idempotency-Key": "" },
    { "Idempotency-Key": "   " },
    { "Idempotency-Key": "x".repeat(256) },
    { "Idempotency-Key": "é".repeat(128) },
    { "Idempotency-Key": "bad\r\nvalue" },
    { "Idempotency-Key": "bad" + String.fromCharCode(127) },
    { "Idempotency-Key": undefined },
    { "Idempotency-Key": null },
  ])(
    "rejects invalid or ambiguous header keys before HTTP: %j",
    async (headers) => {
      const { client, server } = await clientFor(() => ok);
      await expect(async () =>
        client.messages.send("support", text, {
          headers: headers as Readonly<Record<string, string>>,
        }),
      ).rejects.toMatchObject({
        code: "configuration_error",
        field: "idempotencyKey",
      });
      expect(server.requests).toHaveLength(0);
    },
  );

  it("captures a header key before caller mutation during a retry", async () => {
    const headers = { "idempotency-key": "original" };
    const { client, server } = await clientFor((index) => {
      if (index === 0) {
        headers["idempotency-key"] = "changed";
        return {
          status: 503,
          headers: { "content-type": "application/json", "retry-after": "0" },
          body: '{"error":{"code":"service_unavailable"}}',
        };
      }
      return ok;
    }, 1);
    await client.messages.send("support", text, { headers });
    expect(
      server.requests.map(({ headers }) => headers["idempotency-key"]),
    ).toEqual(["original", "original"]);
    expect(headers["idempotency-key"]).toBe("changed");
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
