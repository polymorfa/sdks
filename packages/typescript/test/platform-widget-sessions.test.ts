import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  Client,
  type ApiResponse,
  type DataEnvelope,
  type SessionBatchRemoveResult,
  type SessionBatchStopResult,
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

async function platformServer(): Promise<{
  client: Client;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_platform_widget_sessions",
    },
    body: '{"data":{"id":"fixture"}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new Client({
      credential: {
        type: "organizationApiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("Client batch session lifecycle", () => {
  it("requests bounded asynchronous stops without inventing per-item results", async () => {
    const { client, requests } = await platformServer();

    const stopped = await client.sessions.stopMany(
      {
        projectId: "project/a",
        sessionIds: ["support", "session/a"],
      },
      { idempotencyKey: "stop-sessions-1" },
    );

    expectTypeOf(stopped).toEqualTypeOf<
      ApiResponse<DataEnvelope<SessionBatchStopResult>>
    >();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/platform/sessions/stop",
      body: '{"projectId":"project/a","sessionIds":["support","session/a"]}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("stop-sessions-1");
  });

  it("permanently removes a bounded session set", async () => {
    const { client, requests } = await platformServer();

    const removed = await client.sessions.deleteMany(
      { sessionIds: ["support", "sales"] },
      { idempotencyKey: "delete-sessions-1" },
    );

    expectTypeOf(removed).toEqualTypeOf<
      ApiResponse<DataEnvelope<SessionBatchRemoveResult>>
    >();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/platform/sessions/delete",
      body: '{"sessionIds":["support","sales"]}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("delete-sessions-1");
    expect(removed.metadata.requestId).toBe("req_platform_widget_sessions");
  });
});
