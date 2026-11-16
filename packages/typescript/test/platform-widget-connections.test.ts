import { TEAM_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  Client,
  type ApiResponse,
  type DataEnvelope,
  type ConnectionBatchRemoveResult,
  type ConnectionBatchStopResult,
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
      "x-request-id": "req_platform_widget_connections",
    },
    body: '{"data":{"id":"fixture"}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new Client({
      credential: {
        type: "teamApiKey",
        value: TEAM_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("Client batch connection lifecycle", () => {
  it("requests bounded asynchronous stops without inventing per-item results", async () => {
    const { client, requests } = await platformServer();

    const stopped = await client.connections.stopMany(
      {
        projectId: "project/a",
        connectionIds: ["support", "connection/a"],
      },
      { idempotencyKey: "stop-connections-1" },
    );

    expectTypeOf(stopped).toEqualTypeOf<
      ApiResponse<DataEnvelope<ConnectionBatchStopResult>>
    >();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/platform/connections/stop",
      body: '{"projectId":"project/a","connectionIds":["support","connection/a"]}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("stop-connections-1");
  });

  it("permanently removes a bounded connection set", async () => {
    const { client, requests } = await platformServer();

    const removed = await client.connections.deleteMany(
      { connectionIds: ["support", "sales"] },
      { idempotencyKey: "delete-connections-1" },
    );

    expectTypeOf(removed).toEqualTypeOf<
      ApiResponse<DataEnvelope<ConnectionBatchRemoveResult>>
    >();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/platform/connections/delete",
      body: '{"connectionIds":["support","sales"]}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe(
      "delete-connections-1",
    );
    expect(removed.metadata.requestId).toBe("req_platform_widget_connections");
  });
});
