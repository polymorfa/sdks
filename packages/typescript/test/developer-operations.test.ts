import { afterEach, describe, expect, it } from "vitest";
import { Client, MessagingClient } from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestResponse,
  type TestServer,
} from "./support/http-server.js";

const OPERATION_ID = "00000000-0000-4000-8000-000000000099";
const PROJECT_ID = "11111111-2222-4333-8444-555555555555";
const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function operation(status: string, sequence: number) {
  return {
    id: OPERATION_ID,
    organizationId: "org",
    projectId: PROJECT_ID,
    kind: "campaign",
    resource: { type: "campaign", id: "c1" },
    status,
    sequence,
    capabilities: { cancellable: status === "running", watchable: true },
    progress: null,
    result: null,
    error: null,
    actionRequired: null,
    createdAt: "2026-09-19T00:00:00.000Z",
    updatedAt: "2026-09-19T00:00:00.000Z",
    completedAt: null,
  };
}

const json = (data: unknown): TestResponse => ({
  headers: { "content-type": "application/json" },
  body: JSON.stringify(data),
});

async function serve(
  respond: (request: RecordedRequest, index: number) => TestResponse,
): Promise<{ url: string; requests: RecordedRequest[] }> {
  const server = await startTestServer(respond);
  servers.push(server);
  return server;
}

describe("operations", () => {
  it("is available on organization and project clients but not on messaging", () => {
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    });
    const messaging = new MessagingClient({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
    });
    expect(client).toHaveProperty("operations");
    expect(client.project(PROJECT_ID)).toHaveProperty("operations");
    expect(messaging).not.toHaveProperty("operations");
  });

  it("maps list, get, transitions, and cancel to the organization routes", async () => {
    const server = await serve((request) =>
      request.path.includes("/transitions") ||
      request.path.startsWith("/platform/operations?")
        ? json({ data: [], page: { nextCursor: null, hasMore: false } })
        : request.method === "POST"
          ? json({
              data: {
                operation: operation("cancelling", 3),
                operationId: OPERATION_ID,
                idempotency: { id: "r", key: "k", replayed: false },
              },
            })
          : json({ data: operation("running", 2) }),
    );
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });

    await client.operations.list({
      projectId: PROJECT_ID,
      status: "running",
      resourceType: "campaign",
      resourceId: "c1",
    });
    const got = await client.operations.get(OPERATION_ID);
    await client.operations.listTransitions(OPERATION_ID, { afterSequence: 1 });
    const cancelled = await client.operations.cancel(OPERATION_ID);

    expect(got.data.status).toBe("running");
    expect(cancelled.data.operation.status).toBe("cancelling");
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /platform/operations?projectId=${PROJECT_ID}&status=running&resourceType=campaign&resourceId=c1`,
      `GET /platform/operations/${OPERATION_ID}`,
      `GET /platform/operations/${OPERATION_ID}/transitions?afterSequence=1`,
      `POST /platform/operations/${OPERATION_ID}/cancel`,
    ]);
    expect(server.requests[3]?.headers["idempotency-key"]).toMatch(/.+/);
    expect(server.requests[3]?.body).toBe("");
  });

  it("uses the exact project routes on project clients and keeps a caller key", async () => {
    const server = await serve((request) =>
      request.method === "POST"
        ? json({
            data: {
              operation: operation("cancelling", 3),
              operationId: OPERATION_ID,
              idempotency: { id: "r", key: "mine", replayed: false },
            },
          })
        : json({ data: [], page: { nextCursor: null, hasMore: false } }),
    );
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId: PROJECT_ID,
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    await client.operations.list();
    await client.operations.cancel(OPERATION_ID, { idempotencyKey: "mine" });
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /platform/projects/${PROJECT_ID}/operations`,
      `POST /platform/projects/${PROJECT_ID}/operations/${OPERATION_ID}/cancel`,
    ]);
    expect(server.requests[1]?.headers["idempotency-key"]).toBe("mine");
  });

  it("waits with server long-polls until the operation is terminal", async () => {
    const server = await serve((_request, index) =>
      json({ data: operation(index < 2 ? "running" : "succeeded", index + 2) }),
    );
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    const result = await client.operations.wait(OPERATION_ID, {
      maxWaitMs: 120_000,
    });
    expect(result.data.status).toBe("succeeded");
    expect(server.requests).toHaveLength(3);
    for (const request of server.requests) {
      expect(request.path).toBe(`/platform/operations/${OPERATION_ID}?wait=30`);
    }
  });

  it("stops waiting once the sequence passes afterSequence", async () => {
    const server = await serve(() => json({ data: operation("running", 5) }));
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    const result = await client.operations.wait(OPERATION_ID, {
      afterSequence: 4,
      maxWaitMs: 10_000,
    });
    expect(result.data.sequence).toBe(5);
    expect(server.requests.map((r) => r.path)).toEqual([
      `/platform/operations/${OPERATION_ID}?wait=10&afterSequence=4`,
    ]);
  });

  it("returns the current state when the wait budget is spent", async () => {
    const server = await serve(() => json({ data: operation("running", 2) }));
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    const result = await client.operations.wait(OPERATION_ID, { maxWaitMs: 0 });
    expect(result.data.status).toBe("running");
    expect(server.requests.map((r) => r.path)).toEqual([
      `/platform/operations/${OPERATION_ID}?wait=0`,
    ]);
  });

  it("stops waiting at the budget and keeps the last state it read", async () => {
    const server = await serve((_request, index) => ({
      ...json({ data: operation("running", 2 + index) }),
      // The second read outlives the caller's remaining budget.
      ...(index === 1 ? { delayMs: 3_000 } : {}),
    }));
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    const started = Date.now();
    const result = await client.operations.wait(OPERATION_ID, {
      maxWaitMs: 1_000,
    });
    expect(result.data.status).toBe("running");
    expect(Date.now() - started).toBeLessThan(2_500);
  });

  it("propagates the caller's abort", async () => {
    const server = await serve(() => ({
      ...json({ data: operation("running", 2) }),
      delayMs: 2_000,
    }));
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    const controller = new AbortController();
    const pending = client.operations.wait(OPERATION_ID, {
      maxWaitMs: 60_000,
      signal: controller.signal,
    });
    controller.abort();
    await expect(pending).rejects.toThrow();
  });

  it("rejects an out-of-range wait before sending", async () => {
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: "http://127.0.0.1:9",
    });
    expect(() => client.operations.get(OPERATION_ID, { wait: 31 })).toThrow(
      /wait must be/,
    );
  });
});
