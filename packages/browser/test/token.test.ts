import { describe, expect, it, vi } from "vitest";

import {
  BrowserConfigurationError,
  ClientTokenManager,
  createClientTokenProvider,
  type ClientToken,
} from "../src/index.js";

describe("ClientTokenManager", () => {
  it("deduplicates refreshes and reuses a token outside the expiry skew", async () => {
    let resolveToken:
      | ((value: {
          value: string;
          audience: "browser";
          expiresAt: number;
        }) => void)
      | undefined;
    const provider = vi.fn(
      () =>
        new Promise<{ value: string; audience: "browser"; expiresAt: number }>(
          (resolve) => {
            resolveToken = resolve;
          },
        ),
    );
    const manager = new ClientTokenManager(provider, {
      now: () => 1_000,
      expirySkewMs: 100,
    });

    const first = manager.get();
    const second = manager.get();
    expect(provider).toHaveBeenCalledTimes(1);
    resolveToken?.({
      value: "pmfa_ct_fixture",
      audience: "browser",
      expiresAt: 5_000,
    });
    await expect(Promise.all([first, second])).resolves.toEqual([
      "pmfa_ct_fixture",
      "pmfa_ct_fixture",
    ]);
    await expect(manager.get()).resolves.toBe("pmfa_ct_fixture");
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("refreshes inside the expiry skew", async () => {
    let now = 1_000;
    const provider = vi
      .fn()
      .mockResolvedValueOnce({
        value: "pmfa_ct_first",
        audience: "browser",
        expiresAt: 1_200,
      })
      .mockResolvedValueOnce({
        value: "pmfa_ct_second",
        audience: "browser",
        expiresAt: 5_000,
      });
    const manager = new ClientTokenManager(provider, {
      now: () => now,
      expirySkewMs: 100,
    });
    await expect(manager.get()).resolves.toBe("pmfa_ct_first");
    now = 1_101;
    await expect(manager.get()).resolves.toBe("pmfa_ct_second");
  });

  it("rejects wrong prefixes, expired tokens, and non-browser audiences", async () => {
    for (const token of [
      { value: "pmfa_server", audience: "browser" as const, expiresAt: 5_000 },
      {
        value: "pmfa_ct_expired",
        audience: "browser" as const,
        expiresAt: 999,
      },
      {
        value: "pmfa_ct_server",
        audience: "server" as const,
        expiresAt: 5_000,
      },
    ]) {
      const manager = new ClientTokenManager(async () => token as ClientToken, {
        now: () => 1_000,
      });
      await expect(manager.get()).rejects.toBeInstanceOf(
        BrowserConfigurationError,
      );
    }
  });
});

describe("createClientTokenProvider", () => {
  it("posts to a relative application route and returns browser claims", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        value: "pmfa_ct_route",
        audience: "browser",
        expiresAt: 5_000,
      }),
    );
    const provider = createClientTokenProvider({
      path: "/api/polymorfa/token",
      fetch,
    });

    await expect(provider()).resolves.toEqual({
      value: "pmfa_ct_route",
      audience: "browser",
      expiresAt: 5_000,
    });
    expect(fetch).toHaveBeenCalledWith("/api/polymorfa/token", {
      method: "POST",
      credentials: "same-origin",
      headers: { accept: "application/json" },
    });
  });

  it("rejects absolute paths, HTTP failures, and malformed claims", async () => {
    expect(() =>
      createClientTokenProvider({ path: "https://evil.test/token" }),
    ).toThrow(BrowserConfigurationError);

    const failed = createClientTokenProvider({
      fetch: async () => new Response("private server detail", { status: 500 }),
    });
    await expect(failed()).rejects.toMatchObject({
      category: "server",
      status: 500,
    });
    await expect(failed()).rejects.not.toThrow("private server detail");

    const malformed = createClientTokenProvider({
      fetch: async () => Response.json({ value: "pmfa_server" }),
    });
    await expect(malformed()).rejects.toBeInstanceOf(BrowserConfigurationError);
  });
});
