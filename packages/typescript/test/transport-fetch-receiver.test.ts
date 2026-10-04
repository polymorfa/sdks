import { afterEach, describe, expect, it, vi } from "vitest";

import { HttpTransport } from "../src/transport/http.js";

// Mirrors a native fetch (browsers, Workers), which throws "Illegal
// invocation" before any request when its receiver is not the global object.
function receiverCheckingFetch(): typeof globalThis.fetch {
  return async function (this: unknown) {
    if (this !== undefined && this !== globalThis)
      throw new TypeError("Failed to execute 'fetch': Illegal invocation");
    return Response.json({ ok: true });
  } as typeof globalThis.fetch;
}

describe("HttpTransport fetch receiver", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it.each([
    ["the global fetch", () => ({})],
    ["a supplied native fetch", () => ({ fetch: globalThis.fetch })],
  ])("sends requests through %s", async (_name, options) => {
    vi.stubGlobal("fetch", receiverCheckingFetch());
    const transport = new HttpTransport({
      baseUrl: "https://api.example.com",
      authorization: "Bearer pmfa_example",
      timeoutMs: 500,
      maxNetworkRetries: 0,
      ...options(),
    });

    const response = await transport.request({
      method: "POST",
      path: "/messaging/sales/messages",
      body: {},
    });

    expect(response.metadata.status).toBe(200);
  });
});
