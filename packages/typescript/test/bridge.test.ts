import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  BridgeClient,
  PolymorfaConfigurationError,
  type ApiResponse,
  type BridgeRoute,
} from "../src/index.js";

describe("BridgeClient", () => {
  it("resolves a bridge route using only a project token", async () => {
    const route: BridgeRoute = {
      wsUrl: "wss://bridge.example.com/connect",
      region: "US",
      kind: "production",
      signal: "customer",
      tokenKind: "project",
      expiresAt: 1_788_825_600_000,
    };
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(route),
    );
    const client = new BridgeClient({
      credential: {
        type: "projectToken",
        value: PROJECT_TOKEN,
      },
      baseUrl: "https://api.example.com",
      fetch,
    });

    const response = await client.routes.resolve();

    expectTypeOf(response).toEqualTypeOf<ApiResponse<BridgeRoute>>();
    expect(response.data).toEqual(route);
    expect(fetch).toHaveBeenCalledTimes(1);
    const [url, init] = fetch.mock.calls[0]!;
    expect(new URL(String(url)).pathname).toBe("/v1/bridge/route");
    expect(new Headers(init?.headers).get("authorization")).toBe(
      `Bearer ${PROJECT_TOKEN}`,
    );
  });

  it("rejects listener credentials before transport", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(
      () =>
        new BridgeClient({
          credential: { type: "projectToken", value: "pmfa_ls_listener" },
          fetch,
        }),
    ).toThrow(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects organization credentials supplied by untyped callers", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    expect(
      () =>
        new BridgeClient({
          credential: {
            type: "organizationApiKey",
            value: ORGANIZATION_API_KEY,
          },
          fetch,
        } as never),
    ).toThrow(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects cleartext non-loopback API origins", () => {
    expect(
      () =>
        new BridgeClient({
          credential: {
            type: "projectToken",
            value: PROJECT_TOKEN,
          },
          baseUrl: "http://api.example.com",
        }),
    ).toThrow(PolymorfaConfigurationError);
  });
});
