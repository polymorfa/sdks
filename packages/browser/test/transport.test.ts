import { describe, expect, it, vi } from "vitest";

import {
  BrowserCancelledError,
  BrowserHttpError,
  BrowserTimeoutError,
  BrowserTransport,
  BrowserValidationError,
  type BrowserDiagnosticEvent,
} from "../src/index.js";

describe("BrowserTransport", () => {
  it("protects authorization, returns metadata, and emits redacted diagnostics", async () => {
    const diagnostics: BrowserDiagnosticEvent[] = [];
    let receivedAuthorization = "";
    const transport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: async (_url, init) => {
        receivedAuthorization =
          new Headers(init?.headers).get("authorization") ?? "";
        return new Response('{"data":{"ok":true}}', {
          status: 200,
          headers: {
            "content-type": "application/json",
            "x-request-id": "req_browser",
          },
        });
      },
      onDiagnostic: (event) => diagnostics.push(event),
    });

    const response = await transport.request<{ data: { ok: true } }>({
      method: "GET",
      path: "/client/state",
      headers: { authorization: "Bearer attacker", "x-trace": "fixture" },
    });

    expect(receivedAuthorization).toBe("Bearer pmfa_ct_fixture");
    expect(response.metadata).toMatchObject({
      status: 200,
      requestId: "req_browser",
      attempts: 1,
    });
    expect(JSON.stringify(diagnostics)).not.toContain("pmfa_ct_fixture");
    expect(diagnostics.map(({ type }) => type)).toEqual([
      "request.started",
      "request.completed",
    ]);
  });

  it("retries safe requests but requires an idempotency key for mutations", async () => {
    const getFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(new Response('{"error":"busy"}', { status: 503 }))
      .mockResolvedValueOnce(new Response('{"ok":true}', { status: 200 }));
    const getTransport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: getFetch,
      maxNetworkRetries: 1,
      sleep: async () => undefined,
    });
    await expect(
      getTransport.request({ method: "GET", path: "/client/state" }),
    ).resolves.toMatchObject({
      metadata: { attempts: 2 },
    });

    const postFetch = vi
      .fn<typeof fetch>()
      .mockResolvedValue(new Response('{"error":"busy"}', { status: 503 }));
    const postTransport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: postFetch,
      maxNetworkRetries: 2,
      sleep: async () => undefined,
    });
    await expect(
      postTransport.request({ method: "POST", path: "/client/send", body: {} }),
    ).rejects.toBeInstanceOf(BrowserHttpError);
    expect(postFetch).toHaveBeenCalledTimes(1);
  });

  it("distinguishes caller cancellation from timeout", async () => {
    const pendingFetch: typeof fetch = async (_url, init) =>
      new Promise((_resolve, reject) =>
        init?.signal?.addEventListener("abort", () =>
          reject(init.signal?.reason),
        ),
      );
    const transport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: pendingFetch,
    });
    const controller = new AbortController();
    const cancelled = transport.request({
      method: "GET",
      path: "/client/state",
      signal: controller.signal,
    });
    controller.abort();
    await expect(cancelled).rejects.toBeInstanceOf(BrowserCancelledError);
    await expect(
      transport.request({
        method: "GET",
        path: "/client/state",
        timeoutMs: 1,
        maxNetworkRetries: 0,
      }),
    ).rejects.toBeInstanceOf(BrowserTimeoutError);
  });

  it("rejects absolute and backslash network paths before fetching", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const transport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch,
    });
    for (const path of [
      "https://evil.example/path",
      "//evil.example/path",
      "/\\evil.example/path",
    ]) {
      await expect(
        transport.request({ method: "GET", path }),
      ).rejects.toBeInstanceOf(BrowserValidationError);
    }
    expect(fetch).not.toHaveBeenCalled();
  });

  it("does not retry invalid local request options", async () => {
    const getClientToken = vi.fn(async () => "pmfa_ct_fixture");
    const fetch = vi.fn<typeof globalThis.fetch>();
    const transport = new BrowserTransport({
      getClientToken,
      fetch,
      maxNetworkRetries: 2,
    });
    await expect(
      transport.request({ method: "GET", path: "/client/state", timeoutMs: 0 }),
    ).rejects.toBeInstanceOf(BrowserValidationError);
    expect(getClientToken).toHaveBeenCalledTimes(1);
    expect(fetch).not.toHaveBeenCalled();
  });
});
