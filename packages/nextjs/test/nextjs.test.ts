import { describe, expect, it, vi } from "vitest";
import {
  createClientTokenRoute,
  createMessagingClientTokenMint,
  readVerifiedWebhook,
} from "../src/index.js";

describe("createClientTokenRoute", () => {
  it("authorizes before minting and returns a non-cacheable browser token", async () => {
    const mint = vi.fn(async () => ({
      value: "pmfa_ct_fixture",
      audience: "browser" as const,
      expiresAt: Date.now() + 60_000,
    }));
    const route = createClientTokenRoute({
      authorize: async () => ({ userId: "user_1" }),
      mint,
    });
    const response = await route(
      new Request("https://app.test/token", { method: "POST" }),
    );
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toContain("no-store");
    expect(mint).toHaveBeenCalledWith(
      { userId: "user_1" },
      expect.any(Request),
    );
  });

  it("fails closed without leaking mint errors", async () => {
    const route = createClientTokenRoute({
      authorize: () => ({ userId: "user_1" }),
      mint: async () => {
        throw new Error("database password");
      },
    });
    const response = await route(
      new Request("https://app.test/token", { method: "POST" }),
    );
    expect(response.status).toBe(500);
    expect(await response.text()).not.toContain("database password");
  });
});

describe("createMessagingClientTokenMint", () => {
  it("maps the server SDK envelope to normalized browser claims", async () => {
    const mint = vi.fn(async () => ({
      data: {
        success: true as const,
        data: {
          token: "pmfa_ct_fixture",
          expiresAt: "2026-08-19T20:00:00.000Z",
        },
      },
    }));
    const resolve = vi.fn(async () => ({
      session: "support",
      ephemeralId: "user-1-tab-1",
      ttlSeconds: 600,
    }));
    const adapter = createMessagingClientTokenMint({
      clientTokens: { mint },
      resolve,
    });
    const request = new Request("https://app.test/token", { method: "POST" });

    await expect(adapter({ userId: "user-1" }, request)).resolves.toEqual({
      value: "pmfa_ct_fixture",
      audience: "browser",
      expiresAt: Date.parse("2026-08-19T20:00:00.000Z"),
    });
    expect(resolve).toHaveBeenCalledWith({ userId: "user-1" }, request);
    expect(mint).toHaveBeenCalledWith(
      {
        session: "support",
        ephemeralId: "user-1-tab-1",
        ttlSeconds: 600,
      },
      { signal: request.signal },
    );
  });

  it("fails closed when the SDK returns malformed token data", async () => {
    const adapter = createMessagingClientTokenMint({
      clientTokens: {
        mint: async () => ({
          data: {
            success: true,
            data: {
              token: "server-secret",
              expiresAt: "not-a-date",
            },
          },
        }),
      },
      resolve: async () => ({
        session: "support",
        ephemeralId: "user-1-tab-1",
      }),
    });

    await expect(
      adapter(
        { userId: "user-1" },
        new Request("https://app.test/token", { method: "POST" }),
      ),
    ).rejects.toThrow("invalid client token response");
  });
});

describe("readVerifiedWebhook", () => {
  it("passes untouched raw bytes, the signature, and secret to the SDK verifier", async () => {
    const constructEvent = vi.fn(
      async (body: ArrayBuffer, signature: string, secret: string) => {
        void body;
        void signature;
        void secret;
        return { event: "message.received" };
      },
    );
    const request = new Request("https://app.test/webhook", {
      method: "POST",
      headers: { "x-webhook-signature": "sha256=fixture" },
      body: '{"exact": "bytes"}',
    });
    await expect(
      readVerifiedWebhook(request, { constructEvent, secret: "secret" }),
    ).resolves.toEqual({ event: "message.received" });
    const body = constructEvent.mock.calls[0]?.[0];
    expect(new TextDecoder().decode(body)).toBe('{"exact": "bytes"}');
    expect(constructEvent).toHaveBeenCalledWith(
      expect.any(ArrayBuffer),
      "sha256=fixture",
      "secret",
    );
  });
});
