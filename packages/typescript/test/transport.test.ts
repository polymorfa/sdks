import { afterEach, describe, expect, it, vi } from "vitest";

import {
  PolymorfaAuthenticationError,
  PolymorfaCancelledError,
  PolymorfaConfigurationError,
  PolymorfaConnectionError,
  PolymorfaRateLimitError,
  PolymorfaServerError,
  PolymorfaTimeoutError,
  PolymorfaValidationError,
} from "../src/errors.js";
import { HttpTransport } from "../src/transport/http.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function serverFor(
  respond: Parameters<typeof startTestServer>[0],
): Promise<TestServer> {
  const server = await startTestServer(respond);
  servers.push(server);
  return server;
}

function makeTransport(
  baseUrl: string,
  options: Partial<ConstructorParameters<typeof HttpTransport>[0]> = {},
): HttpTransport {
  return new HttpTransport({
    baseUrl,
    authorization: "Bearer pmfa_example",
    timeoutMs: 500,
    maxNetworkRetries: 0,
    sleep: async () => undefined,
    random: () => 0,
    ...options,
  });
}

describe("HttpTransport", () => {
  it("rejects cleartext credential transport outside loopback", () => {
    expect(() => makeTransport("http://api.example.com")).toThrow(
      PolymorfaConfigurationError,
    );
  });

  it("disables automatic redirects for credentialed requests", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({ ok: true }),
    );
    const transport = makeTransport("https://api.example.com", { fetch });

    await transport.request({ method: "GET", path: "/v1/check" });

    expect(fetch.mock.calls[0]?.[1]?.redirect).toBe("error");
  });

  it("sends protected headers and returns immutable response metadata", async () => {
    const server = await serverFor(() => ({
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_123",
        "polymorfa-version": "2026-08-19",
        "x-ratelimit-remaining": "41",
        "set-cookie": "session=secret",
        "x-internal-debug": "database-host",
      },
      body: '{"ok":true}',
    }));

    const response = await makeTransport(server.url, {
      apiVersion: "2026-08-19",
    }).request<{ ok: true }>({
      method: "GET",
      path: "/v1/check",
      headers: { authorization: "Bearer attacker", "x-client-context": "cli" },
    });

    expect(response.data).toEqual({ ok: true });
    expect(response.metadata).toMatchObject({
      status: 200,
      requestId: "req_123",
      apiVersion: "2026-08-19",
      attempts: 1,
    });
    expect(response.metadata.headers["x-ratelimit-remaining"]).toBe("41");
    expect(response.metadata.headers).not.toHaveProperty("set-cookie");
    expect(response.metadata.headers).not.toHaveProperty("x-internal-debug");
    expect(Object.isFrozen(response.metadata)).toBe(true);
    expect(server.requests[0]?.headers.authorization).toBe(
      "Bearer pmfa_example",
    );
    expect(server.requests[0]?.headers["polymorfa-version"]).toBe("2026-08-19");
    expect(server.requests[0]?.headers["x-client-context"]).toBe("cli");
    expect(server.requests[0]?.headers["user-agent"]).toMatch(
      /^polymorfa-node\//,
    );
  });

  it("encodes query arrays, JSON bodies, and per-request API versions", async () => {
    const server = await serverFor(() => ({
      status: 201,
      body: '{"created":true}',
    }));
    await makeTransport(server.url, { apiVersion: "2026-01-01" }).request({
      method: "POST",
      path: "/v1/projects",
      query: {
        include: ["members", "keys"],
        archived: false,
        omitted: undefined,
      },
      body: { name: "Support" },
      apiVersion: "2026-08-19",
      idempotencyKey: "project-support",
    });

    expect(server.requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/projects?include=members&include=keys&archived=false",
      body: '{"name":"Support"}',
    });
    expect(server.requests[0]?.headers["content-type"]).toBe(
      "application/json",
    );
    expect(server.requests[0]?.headers["idempotency-key"]).toBe(
      "project-support",
    );
    expect(server.requests[0]?.headers["polymorfa-version"]).toBe("2026-08-19");
  });

  it("decodes text and empty successful responses", async () => {
    const server = await serverFor((_request, index) =>
      index === 0
        ? { headers: { "content-type": "text/plain" }, body: "ready" }
        : { status: 204 },
    );

    const transport = makeTransport(server.url);
    await expect(
      transport.request<string>({ method: "GET", path: "/text" }),
    ).resolves.toMatchObject({
      data: "ready",
    });
    await expect(
      transport.request<void>({ method: "GET", path: "/empty" }),
    ).resolves.toMatchObject({
      data: undefined,
    });
  });

  it("maps API failures to typed errors with request metadata", async () => {
    const server = await serverFor((request) => {
      if (request.path === "/unauthorized") {
        return {
          status: 401,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req_auth",
          },
          body: '{"error":"bad key","code":"invalid_key"}',
        };
      }
      return {
        status: 400,
        headers: {
          "content-type": "application/json",
          "x-request-id": "req_validation",
        },
        body: '{"error":"invalid project"}',
      };
    });
    const transport = makeTransport(server.url);

    const authError = await transport
      .request({ method: "GET", path: "/unauthorized" })
      .catch((error) => error);
    expect(authError).toBeInstanceOf(PolymorfaAuthenticationError);
    expect(authError).toMatchObject({
      status: 401,
      requestId: "req_auth",
      code: "invalid_key",
    });

    const validationError = await transport
      .request({ method: "GET", path: "/invalid" })
      .catch((error) => error);
    expect(validationError).toBeInstanceOf(PolymorfaValidationError);
    expect(validationError).toMatchObject({
      status: 400,
      requestId: "req_validation",
    });
  });

  it("distinguishes SDK timeouts from caller cancellation", async () => {
    const server = await serverFor(() => ({
      delayMs: 100,
      body: '{"ok":true}',
    }));

    await expect(
      makeTransport(server.url, { timeoutMs: 10 }).request({
        method: "GET",
        path: "/slow",
      }),
    ).rejects.toBeInstanceOf(PolymorfaTimeoutError);

    const controller = new AbortController();
    const pending = makeTransport(server.url, { timeoutMs: 500 }).request({
      method: "GET",
      path: "/cancel",
      signal: controller.signal,
    });
    setTimeout(() => controller.abort(), 10);
    await expect(pending).rejects.toBeInstanceOf(PolymorfaCancelledError);
  });

  it("retries a safe request and reports the attempt count", async () => {
    const server = await serverFor((_request, index) =>
      index === 0
        ? { status: 503, body: '{"error":"busy"}' }
        : { body: '{"ok":true}' },
    );

    const response = await makeTransport(server.url, {
      maxNetworkRetries: 2,
    }).request<{ ok: true }>({
      method: "GET",
      path: "/retry",
    });
    expect(response.data.ok).toBe(true);
    expect(response.metadata.attempts).toBe(2);
    expect(server.requests).toHaveLength(2);
  });

  it("does not retry an unsafe request without an idempotency key", async () => {
    const server = await serverFor((_request, index) =>
      index === 0
        ? { status: 503, body: '{"error":"busy"}' }
        : { body: '{"ok":true}' },
    );

    await expect(
      makeTransport(server.url, { maxNetworkRetries: 2 }).request({
        method: "POST",
        path: "/messages",
        body: { text: "hello" },
      }),
    ).rejects.toBeInstanceOf(PolymorfaServerError);
    expect(server.requests).toHaveLength(1);
  });

  it("retries an unsafe request carrying an idempotency key", async () => {
    const server = await serverFor((_request, index) =>
      index === 0
        ? { status: 503, body: '{"error":"busy"}' }
        : { body: '{"ok":true}' },
    );

    const response = await makeTransport(server.url, {
      maxNetworkRetries: 2,
    }).request({
      method: "POST",
      path: "/messages",
      body: { text: "hello" },
      idempotencyKey: "send-42",
    });
    expect(response.metadata.attempts).toBe(2);
    expect(server.requests[1]?.headers["idempotency-key"]).toBe("send-42");
  });

  it("honors Retry-After for rate limits", async () => {
    const delays: number[] = [];
    const server = await serverFor((_request, index) =>
      index === 0
        ? { status: 429, headers: { "retry-after": "2" }, body: "rate limited" }
        : { body: '{"ok":true}' },
    );

    await makeTransport(server.url, {
      maxNetworkRetries: 1,
      sleep: async (milliseconds) => {
        delays.push(milliseconds);
      },
    }).request({ method: "GET", path: "/limited" });
    expect(delays).toEqual([2_000]);
  });

  it("surfaces a terminal rate limit when retries are disabled", async () => {
    const server = await serverFor(() => ({
      status: 429,
      body: '{"error":"slow down"}',
    }));
    await expect(
      makeTransport(server.url).request({ method: "GET", path: "/limited" }),
    ).rejects.toBeInstanceOf(PolymorfaRateLimitError);
  });

  it("rejects absolute raw URLs before credentials can leave the configured host", async () => {
    const transport = makeTransport("http://127.0.0.1:1");
    await expect(
      transport.request({ method: "GET", path: "https://example.com/steal" }),
    ).rejects.toBeInstanceOf(PolymorfaValidationError);
  });

  it("maps unreachable hosts to a connection error", async () => {
    await expect(
      makeTransport("http://127.0.0.1:1", { timeoutMs: 100 }).request({
        method: "GET",
        path: "/unreachable",
      }),
    ).rejects.toBeInstanceOf(PolymorfaConnectionError);
  });
});
