import { describe, expect, it, vi } from "vitest";

import {
  BrowserConfigurationError,
  ClientTokenManager,
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
