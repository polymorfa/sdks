import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  Client,
  PolymorfaConfigurationError,
  PolymorfaServerError,
  PolymorfaValidationError,
  RequestLogsResource,
  type RequestLog,
} from "../src/index.js";
import { retryAfterMs } from "../src/platform/request-logs.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestResponse,
  type TestServer,
} from "./support/http-server.js";

const PROJECT = "11111111-1111-4111-8111-111111111111";
const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function entry(id: string, createdAt = "2026-10-10T12:00:00.000Z"): RequestLog {
  return {
    id,
    projectId: PROJECT,
    createdAt,
    method: "POST",
    route: "/messaging/:session/messages",
    status: 422,
    durationMs: 41,
    result: "failure",
    source: "api",
    requestId: `req-${id}`,
    traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
    errorCode: "invalid_recipient",
    mcpTool: null,
    credential: { type: "project_token", id: PROJECT, last4: "wxyz" },
  };
}

function page(
  items: RequestLog[],
  follow: string,
  extra: Record<string, unknown> = {},
): TestResponse {
  return {
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data: items,
      page: {
        nextCursor: null,
        hasMore: false,
        followCursor: follow,
        ...extra,
      },
    }),
  };
}

async function logServer(
  respond: (request: RecordedRequest, index: number) => TestResponse,
  credential: "organizationApiKey" | "projectToken" = "organizationApiKey",
) {
  const server = await startTestServer(respond);
  servers.push(server);
  const client =
    credential === "projectToken"
      ? new Client({
          credential: { type: "projectToken", value: PROJECT_TOKEN },
          projectId: PROJECT,
          baseUrl: server.url,
          maxNetworkRetries: 0,
        })
      : new Client({
          credential: {
            type: "organizationApiKey",
            value: ORGANIZATION_API_KEY,
          },
          baseUrl: server.url,
          maxNetworkRetries: 0,
        });
  return { client, requests: server.requests };
}

describe("Client.requestLogs", () => {
  it("is available on team and project clients", () => {
    expectTypeOf<Client["requestLogs"]>().toEqualTypeOf<RequestLogsResource>();
    expectTypeOf<
      Client<"project">["requestLogs"]
    >().toEqualTypeOf<RequestLogsResource>();
  });

  it("encodes filters and returns both cursors", async () => {
    const { client, requests } = await logServer(() =>
      page([entry("a")], "follow-1", { nextCursor: "older-1", hasMore: true }),
    );
    const result = await client.requestLogs.list({
      projectId: PROJECT,
      status: [404, "5xx"],
      method: ["POST", "DELETE"],
      route: "/messaging/:session/messages",
      source: "mcp",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      since: new Date("2026-10-10T00:00:00.000Z"),
      limit: 50,
    });
    const url = new URL(requests[0]!.path, "http://localhost");
    expect(url.pathname).toBe(`/platform/projects/${PROJECT}/request-logs`);
    expect(Object.fromEntries(url.searchParams)).toEqual({
      status: "404,5xx",
      method: "POST,DELETE",
      route: "/messaging/:session/messages",
      source: "mcp",
      traceId: "4bf92f3577b34da6a3ce929d0e0e4736",
      since: "2026-10-10T00:00:00.000Z",
      limit: "50",
    });
    expect(result).toMatchObject({
      hasMore: true,
      nextCursor: "older-1",
      followCursor: "follow-1",
    });
    expect(result.items[0]?.traceId).toBe("4bf92f3577b34da6a3ce929d0e0e4736");
  });

  it("uses a project client's own project and refuses another", async () => {
    const { client, requests } = await logServer(
      () => page([], "follow-1"),
      "projectToken",
    );
    await client.requestLogs.follow({ after: "follow-0" });
    expect(requests[0]!.path).toBe(
      `/platform/projects/${PROJECT}/request-logs?after=follow-0`,
    );
    await expect(
      client.requestLogs.list({
        projectId: "22222222-2222-4222-8222-222222222222",
      }),
    ).rejects.toBeInstanceOf(PolymorfaValidationError);
  });

  it("requires a project on a team client and refuses cursor with filters", async () => {
    const { client, requests } = await logServer(() => page([], "f"));
    await expect(client.requestLogs.list()).rejects.toBeInstanceOf(
      PolymorfaConfigurationError,
    );
    await expect(
      client.requestLogs.list({
        projectId: PROJECT,
        cursor: "c",
        status: ["5xx"],
      }),
    ).rejects.toBeInstanceOf(PolymorfaValidationError);
    expect(requests).toHaveLength(0);
  });

  it("rejects a page without a follow cursor", async () => {
    const { client } = await logServer(() => ({
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        data: [],
        page: { nextCursor: null, hasMore: false },
      }),
    }));
    await expect(
      client.requestLogs.list({ projectId: PROJECT }),
    ).rejects.toBeInstanceOf(PolymorfaServerError);
  });
});

describe("Client.requestLogs.tail", () => {
  it("yields the backfill oldest first, then follows new requests", async () => {
    const controller = new AbortController();
    const { client, requests } = await logServer((_request, index) => {
      if (index === 0)
        return page(
          [
            entry("b", "2026-10-10T12:00:02.000Z"),
            entry("a", "2026-10-10T12:00:01.000Z"),
          ],
          "follow-1",
        );
      if (index === 1) return page([entry("c")], "follow-2", { hasMore: true });
      return page([entry("d")], "follow-3");
    });
    const seen: string[] = [];
    for await (const log of client.requestLogs.tail({
      projectId: PROJECT,
      backfill: 2,
      intervalMs: 1_000,
      signal: controller.signal,
      status: ["5xx"],
    })) {
      seen.push(log.id);
      if (seen.length === 4) controller.abort();
    }
    expect(seen).toEqual(["a", "b", "c", "d"]);
    expect(
      new URL(requests[0]!.path, "http://localhost").searchParams.get("status"),
    ).toBe("5xx");
    // A page with more waiting is read again at once, using the newest cursor.
    expect(
      new URL(requests[1]!.path, "http://localhost").searchParams.get("after"),
    ).toBe("follow-1");
    expect(
      new URL(requests[2]!.path, "http://localhost").searchParams.get("after"),
    ).toBe("follow-2");
  });

  it("waits for Retry-After on a rate limit and stops when aborted", async () => {
    const controller = new AbortController();
    const { client, requests } = await logServer((_request, index) => {
      if (index === 0) return page([], "follow-1");
      if (index === 1) {
        return {
          status: 429,
          headers: { "content-type": "application/json", "retry-after": "1" },
          body: JSON.stringify({
            error: {
              type: "rate_limit_error",
              code: "rate_limit_exceeded",
              message: "slow down",
            },
          }),
        };
      }
      controller.abort();
      return page([entry("z")], "follow-2");
    });
    const started = Date.now();
    const seen: string[] = [];
    for await (const log of client.requestLogs.tail({
      projectId: PROJECT,
      intervalMs: 1_000,
      signal: controller.signal,
    }))
      seen.push(log.id);
    expect(Date.now() - started).toBeGreaterThanOrEqual(900);
    expect(requests).toHaveLength(3);
    expect(seen).toEqual([]);
  });

  it("validates the polling interval and backfill", async () => {
    const { client } = await logServer(() => page([], "f"));
    await expect(
      client.requestLogs.tail({ projectId: PROJECT, intervalMs: 500 }).next(),
    ).rejects.toBeInstanceOf(PolymorfaValidationError);
    await expect(
      client.requestLogs.tail({ projectId: PROJECT, backfill: 101 }).next(),
    ).rejects.toBeInstanceOf(PolymorfaValidationError);
  });

  it("stops yielding a fetched page as soon as the signal aborts", async () => {
    const controller = new AbortController();
    const { client } = await logServer((_request, index) =>
      index === 0
        ? page([], "follow-1")
        : page([entry("a"), entry("b"), entry("c")], "follow-2"),
    );
    const seen: string[] = [];
    for await (const log of client.requestLogs.tail({
      projectId: PROJECT,
      intervalMs: 1_000,
      signal: controller.signal,
    })) {
      seen.push(log.id);
      controller.abort();
    }
    expect(seen).toEqual(["a"]);
  });

  it("reads Retry-After as delta-seconds, including zero, or an HTTP-date", () => {
    const now = Date.parse("2026-10-10T12:00:00.000Z");
    expect(retryAfterMs("0", now)).toBe(0);
    expect(retryAfterMs("7", now)).toBe(7_000);
    expect(retryAfterMs("Sat, 10 Oct 2026 12:00:05 GMT", now)).toBe(5_000);
    expect(retryAfterMs("Sat, 10 Oct 2026 11:59:00 GMT", now)).toBe(0);
    expect(retryAfterMs(undefined, now)).toBe(60_000);
    expect(retryAfterMs("soon", now)).toBe(60_000);
  });

  it("accepts a cursor alongside empty filter lists", async () => {
    const { client, requests } = await logServer(() => page([], "f"));
    await client.requestLogs.list({
      projectId: PROJECT,
      cursor: "older-1",
      status: [],
      method: [],
    });
    expect(new URL(requests[0]!.path, "http://localhost").search).toBe(
      "?cursor=older-1",
    );
  });
});
