import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  PRESENCE_CHAT_STATES,
  PRESENCE_OBSERVATION_STATUSES,
  PRESENCE_STATES,
  PRESENCE_UNKNOWN_REASONS,
  PresenceResource,
  type ApiResponse,
  type ChatPresenceData,
  type GetChatPresenceResponse,
  type GetPresenceResponse,
  type PresenceData,
  type PresenceState,
  type SetPresenceResponse,
  type SubscribePresenceResponse,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function presenceServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    status: 200,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_presence",
    },
    body: request.path.endsWith("/subscribe")
      ? '{"success":true,"data":{"status":"SUBSCRIBED","expiresAt":"2026-08-20T12:02:00.000Z"}}'
      : request.method === "POST"
        ? '{"success":true,"data":{"status":"OK"}}'
        : request.path.includes("/presence/")
          ? '{"success":true,"data":{"policy":"cache","status":"fresh","available":true,"observedAt":"2026-08-20T12:00:00.000Z","subscriptionExpiresAt":"2026-08-20T12:02:00.000Z","stale":false,"typingPolicy":"events","typingStatus":"unknown","typingUnknownReason":"not_observed"}}'
          : '{"success":true,"data":{"desired":"available","desiredAt":"2026-08-20T12:00:00.000Z","lastSent":"available","lastSentAt":"2026-08-20T12:00:01.000Z","authoritative":false}}',
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

describe("MessagingClient presence", () => {
  it("exports the exact state and observation vocabularies", () => {
    expect(PRESENCE_STATES).toEqual(["available", "unavailable"]);
    expect(PRESENCE_OBSERVATION_STATUSES).toEqual([
      "unknown",
      "fresh",
      "stale",
    ]);
    expect(PRESENCE_UNKNOWN_REASONS).toEqual([
      "disabled",
      "not_observed",
      "suspended",
    ]);
    expect(PRESENCE_CHAT_STATES).toEqual(["composing", "paused"]);
    expectTypeOf<PresenceState>().toEqualTypeOf<"available" | "unavailable">();
    expectTypeOf<
      MessagingClient["presence"]
    >().toEqualTypeOf<PresenceResource>();
  });

  it("maps the complete Presence tag with encoded identifiers", async () => {
    const { client, requests } = await presenceServer();
    const presence = client.presence;

    const set = await presence.set(
      "support/eu",
      { presence: "available" },
      { idempotencyKey: "presence-self-1" },
    );
    const self = await presence.get("support/eu", {
      apiVersion: "next",
      headers: { "x-cli-command": "presence view" },
    });
    const chat = await presence.getForChat(
      "support/eu",
      "1555/7@s.whatsapp.net",
    );
    const subscribed = await presence.subscribe(
      "support/eu",
      "1555/7@s.whatsapp.net",
      { idempotencyKey: "presence-subscribe-1" },
    );

    expectTypeOf(set).toEqualTypeOf<ApiResponse<SetPresenceResponse>>();
    expectTypeOf(self).toEqualTypeOf<ApiResponse<GetPresenceResponse>>();
    expectTypeOf(chat).toEqualTypeOf<ApiResponse<GetChatPresenceResponse>>();
    expectTypeOf(subscribed).toEqualTypeOf<
      ApiResponse<SubscribePresenceResponse>
    >();
    expectTypeOf(self.data.data).toEqualTypeOf<PresenceData>();
    expectTypeOf(chat.data.data).toEqualTypeOf<ChatPresenceData>();
    expect(self.data.data.authoritative).toBe(false);
    expect(chat.data.data.status).toBe("fresh");
    expect(subscribed.data).toEqual({
      success: true,
      data: {
        status: "SUBSCRIBED",
        expiresAt: "2026-08-20T12:02:00.000Z",
      },
    });
    expect(self.metadata.requestId).toBe("req_presence");

    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "POST",
        path: "/messaging/support%2Feu/presence",
        body: '{"presence":"available"}',
      },
      {
        method: "GET",
        path: "/messaging/support%2Feu/presence",
        body: "",
      },
      {
        method: "GET",
        path: "/messaging/support%2Feu/presence/1555%2F7%40s.whatsapp.net",
        body: "",
      },
      {
        method: "POST",
        path: "/messaging/support%2Feu/presence/1555%2F7%40s.whatsapp.net/subscribe",
        body: "",
      },
    ]);
    expect(requests[0]?.headers["idempotency-key"]).toBe("presence-self-1");
    expect(requests[3]?.headers["idempotency-key"]).toBe(
      "presence-subscribe-1",
    );
    expect(requests[1]?.headers["polymorfa-version"]).toBe("next");
    expect(requests[1]?.headers["x-cli-command"]).toBe("presence view");
  });
});
