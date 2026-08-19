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

describe("PlatformClient opt-outs", () => {
  it("maps list, single, batch, and encoded delete operations", async () => {
    const { client, requests } = await platformServer();
    await client.optOuts.list();
    await client.optOuts.create(
      { phone: "+1 555" },
      { idempotencyKey: "opt-out-1" },
    );
    await client.optOuts.createBatch({ phones: ["+1 555", "+44 20"] });
    await client.optOuts.delete("+1/555");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/optouts",
      "POST /v1/optouts",
      "POST /v1/optouts/batch",
      "DELETE /v1/optouts/%2B1%2F555",
    ]);
    expect(requests[1]?.body).toBe('{"phone":"+1 555"}');
    expect(requests[1]?.headers["idempotency-key"]).toBe("opt-out-1");
    expect(requests[2]?.body).toBe('{"phones":["+1 555","+44 20"]}');
  });
});

describe("PlatformClient audiences", () => {
  it("maps collection, encoded item, and upload operations", async () => {
    const { client, requests } = await platformServer();
    await client.audiences.list();
    await client.audiences.create(
      { name: "August" },
      { idempotencyKey: "audience-1" },
    );
    await client.audiences.retrieve("list/a");
    await client.audiences.delete("list/a");
    await client.audiences.createUpload({ filename: "audience.csv" });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/audiences",
      "POST /v1/audiences",
      "GET /v1/audiences/list%2Fa",
      "DELETE /v1/audiences/list%2Fa",
      "POST /v1/audiences/uploads",
    ]);
    expect(requests[1]?.body).toBe('{"name":"August"}');
    expect(requests[1]?.headers["idempotency-key"]).toBe("audience-1");
    expect(requests[4]?.body).toBe('{"filename":"audience.csv"}');
  });
});
