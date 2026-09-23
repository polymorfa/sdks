import { describe, expect, it, vi } from "vitest";

import {
  BrowserCancelledError,
  BrowserConfigurationError,
  BrowserMessagingClient,
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

  it("pins browser message receipts to the native whatsapp_ids contract", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        success: true,
        data: {
          id: "pmfa_msg_1",
          whatsapp_ids: { linked_devices: "provider-1" },
          timestamp: 123,
        },
      }),
    );
    const client = new BrowserMessagingClient({
      session: "number/1",
      getClientToken: async () => "pmfa_ct_fixture",
      fetch,
    });
    const response = await client.messages.send({
      conversation: { phoneNumber: "+15551234567" },
      content: { text: "Hello" },
    });
    expect(new URL(String(fetch.mock.calls[0]?.[0])).pathname).toBe(
      "/messaging/number%2F1/messages/send",
    );
    const headers = new Headers(fetch.mock.calls[0]?.[1]?.headers);
    expect(headers.get("polymorfa-version")).toBe("2026-09-22");
    expect(headers.get("authorization")).toBe("Bearer pmfa_ct_fixture");
    expect(response.data.data).toMatchObject({
      whatsapp_ids: { linked_devices: "provider-1" },
    });
  });

  it("preserves an explicit retired version header and reports rejection without upgrading or retrying", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json(
        {
          error: {
            code: "invalid_parameter",
            message:
              "API version 2026-08-19 is no longer supported. Minimum: 2026-09-22",
            param: "Polymorfa-Version",
          },
        },
        { status: 400 },
      ),
    );
    const client = new BrowserMessagingClient({
      session: "number",
      getClientToken: async () => "pmfa_ct_fixture",
      fetch,
      maxNetworkRetries: 2,
    });
    await expect(
      client.messages.send(
        {
          conversation: { phoneNumber: "+15551234567" },
          content: { text: "Hello" },
        },
        { headers: { "Polymorfa-Version": "2026-08-19" } },
      ),
    ).rejects.toMatchObject({ code: "invalid_parameter", status: 400 });
    expect(fetch).toHaveBeenCalledOnce();
    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get("polymorfa-version"),
    ).toBe("2026-08-19");
  });

  it("excludes raw Graph and application routes from the native default", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () => Response.json({}));
    const transport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch,
    });
    await transport.request({
      method: "GET",
      path: "/graph/whatsapp/v26.0/123",
    });
    await transport.request({
      method: "GET",
      path: "/api/application-adapter",
    });
    expect(
      fetch.mock.calls.map(([, init]) =>
        new Headers(init?.headers).get("polymorfa-version"),
      ),
    ).toEqual([null, null]);
  });

  it.each([`pmfa_${"A".repeat(72)}`, `pmfa_pt_${"A".repeat(94)}`])(
    "continues rejecting server credentials before native requests: %s",
    async (credential) => {
      const fetch = vi.fn<typeof globalThis.fetch>();
      const transport = new BrowserTransport({
        getClientToken: async () => credential,
        fetch,
      });
      await expect(
        transport.request({
          method: "GET",
          path: "/messaging/number/contacts",
        }),
      ).rejects.toBeInstanceOf(BrowserConfigurationError);
      expect(fetch).not.toHaveBeenCalled();
    },
  );

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

  it("surfaces a replayed idempotent failure without retrying", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      async () =>
        new Response(
          '{"error":{"code":"result_unknown","message":"unknown"}}',
          {
            status: 503,
            headers: {
              "content-type": "application/json",
              "idempotent-replayed": "true",
            },
          },
        ),
    );
    const transport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: fetcher,
      maxNetworkRetries: 2,
      sleep: async () => undefined,
    });
    await expect(
      transport.request({
        method: "POST",
        path: "/client/send",
        body: {},
        idempotencyKey: "send-1",
      }),
    ).rejects.toBeInstanceOf(BrowserHttpError);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not retry a conflict carrying an operation receipt", async () => {
    const fetcher = vi.fn<typeof fetch>(async () =>
      Response.json(
        { error: { code: "operation_in_progress", message: "In progress" } },
        {
          status: 409,
          headers: { "x-polymorfa-operation-id": "op_in_progress" },
        },
      ),
    );
    const transport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: fetcher,
      maxNetworkRetries: 2,
      sleep: async () => undefined,
    });

    await expect(
      transport.request({
        method: "POST",
        path: "/messaging/number/messages/send",
        body: { text: "hello" },
        idempotencyKey: "send-accepted",
      }),
    ).rejects.toMatchObject({
      status: 409,
      metadata: { operationId: "op_in_progress", attempts: 1 },
    });
    expect(fetcher).toHaveBeenCalledOnce();
  });

  it("preserves an operation receipt when response body reading fails", async () => {
    const diagnostics: BrowserDiagnosticEvent[] = [];
    const fetcher = vi.fn<typeof fetch>(
      async () =>
        new Response(
          new ReadableStream({
            start(controller) {
              controller.error(new Error("body disconnected"));
            },
          }),
          {
            status: 202,
            headers: {
              "content-type": "application/json",
              "x-polymorfa-operation-id": "op_accepted",
              "x-request-id": "req_accepted",
            },
          },
        ),
    );
    const transport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: fetcher,
      maxNetworkRetries: 2,
      sleep: async () => undefined,
      onDiagnostic: (event) => diagnostics.push(event),
    });

    await expect(
      transport.request({
        method: "POST",
        path: "/messaging/number/messages/send",
        body: { text: "hello" },
        idempotencyKey: "send-accepted",
      }),
    ).rejects.toMatchObject({
      category: "connection",
      code: "connection_error",
      status: 202,
      requestId: "req_accepted",
      metadata: { operationId: "op_accepted", attempts: 1 },
    });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(diagnostics.map(({ type }) => type)).toEqual([
      "request.started",
      "request.failed",
    ]);
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

  it("reads the code, request ID, and doc link from an error body without the header", async () => {
    const transport = new BrowserTransport({
      getClientToken: async () => "pmfa_ct_fixture",
      fetch: async () =>
        new Response(
          JSON.stringify({
            error: {
              type: "rate_limit_error",
              code: "whatsapp_rate_limited",
              message: "WhatsApp is limiting requests from this number.",
              param: null,
              request_id: "req_body_only",
            },
            data: null,
            docs: "https://docs.polymorfa.com/api/errors#whatsapp-rate-limited",
          }),
          { status: 429, headers: { "content-type": "application/json" } },
        ),
      maxNetworkRetries: 0,
      sleep: async () => undefined,
    });
    const failure = await transport
      .request({ method: "GET", path: "/client/state" })
      .catch((error: unknown) => error);
    expect(failure).toBeInstanceOf(BrowserHttpError);
    expect(failure).toMatchObject({
      category: "rate_limit",
      code: "whatsapp_rate_limited",
      requestId: "req_body_only",
      docUrl: "https://docs.polymorfa.com/api/errors#whatsapp-rate-limited",
      message: "WhatsApp is limiting requests from this number.",
    });
  });
});
