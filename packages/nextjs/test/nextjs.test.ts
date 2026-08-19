import { describe, expect, it, vi } from "vitest";
import { createClientTokenRoute, readVerifiedWebhook } from "../src/index.js";

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
