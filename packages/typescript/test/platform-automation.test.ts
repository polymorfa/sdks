import { afterEach, describe, expect, it } from "vitest";

import { PlatformClient } from "../src/platform/client.js";
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
  client: PlatformClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_platform_automation",
    },
    body: '{"data":{"id":"fixture"}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new PlatformClient({
      apiKey: "pmfa_platform",
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("PlatformClient media", () => {
  it("maps media URL, delete, and upload operations", async () => {
    const { client, requests } = await platformServer();
    const retrieved = await client.media.retrieve("media/a");
    await client.media.delete("media/a");
    await client.media.createUpload(
      { projectId: "project_1", contentType: "image/png" },
      { idempotencyKey: "upload-1" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/media/media%2Fa",
      "DELETE /v1/media/media%2Fa",
      "POST /v1/media/uploads",
    ]);
    expect(requests[2]?.body).toBe(
      '{"projectId":"project_1","contentType":"image/png"}',
    );
    expect(requests[2]?.headers["idempotency-key"]).toBe("upload-1");
    expect(retrieved.metadata.requestId).toBe("req_platform_automation");
  });
});
