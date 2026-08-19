import { afterEach, describe, expect, it } from "vitest";

import { RawClient } from "../src/raw.js";
import { HttpTransport } from "../src/transport/http.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("RawClient", () => {
  it("preserves request options and response metadata", async () => {
    const server = await startTestServer(() => ({
      status: 201,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_raw",
        "polymorfa-version": "2026-08-19",
      },
      body: '{"ok":true}',
    }));
    servers.push(server);
    const raw = new RawClient(
      new HttpTransport({
        baseUrl: server.url,
        authorization: "Bearer pmfa_example",
        timeoutMs: 500,
        maxNetworkRetries: 0,
      }),
    );

    const response = await raw.request<{ ok: true }>({
      method: "POST",
      path: "/v1/custom",
      query: { projectId: "project_1", include: ["members", "keys"] },
      body: { enabled: true },
      apiVersion: "2026-08-19",
      headers: { "x-trace": "cli" },
      idempotencyKey: "custom-1",
    });

    expect(response.data).toEqual({ ok: true });
    expect(response.metadata.requestId).toBe("req_raw");
    expect(server.requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/custom?projectId=project_1&include=members&include=keys",
      body: '{"enabled":true}',
    });
    expect(server.requests[0]?.headers["x-trace"]).toBe("cli");
  });
});
