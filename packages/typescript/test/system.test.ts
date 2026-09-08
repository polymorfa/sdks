import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  SystemClient,
  type ApiResponse,
  type HealthResponse,
  type PingResponse,
  type StatusResponse,
  type VersionResponse,
} from "../src/index.js";

describe("SystemClient", () => {
  it("calls the credential-free health and information routes", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async (input) => {
      const path = new URL(String(input)).pathname;
      const data: Record<string, unknown> = {
        "/api/info/status": {
          status: "ready",
          uptime: "2h",
          version: "1.2.3",
          env: "staging",
        },
        "/api/info/version": {
          version: "1.2.3",
          buildTime: "2026-09-08T00:00:00Z",
          env: "staging",
          apiVersion: "1.0.0",
          minSupportedVersion: "1.0.0",
        },
        "/health": {
          status: "healthy",
          checks: { database: { status: "healthy" } },
        },
        "/ping": { status: "ok" },
      };
      return Response.json(data[path]);
    });
    const system = new SystemClient({
      baseUrl: "https://api.example.com",
      fetch,
    });

    const status = await system.status();
    const version = await system.version();
    const health = await system.health();
    const ping = await system.ping();

    expectTypeOf(status).toEqualTypeOf<ApiResponse<StatusResponse>>();
    expectTypeOf(version).toEqualTypeOf<ApiResponse<VersionResponse>>();
    expectTypeOf(health).toEqualTypeOf<ApiResponse<HealthResponse>>();
    expectTypeOf(ping).toEqualTypeOf<ApiResponse<PingResponse>>();
    expect(
      fetch.mock.calls.map(([input]) => new URL(String(input)).pathname),
    ).toEqual(["/api/info/status", "/api/info/version", "/health", "/ping"]);
    for (const [, init] of fetch.mock.calls) {
      expect(new Headers(init?.headers).has("authorization")).toBe(false);
    }
  });
});
