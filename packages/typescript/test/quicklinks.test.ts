import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  MessagingClient,
  PolymorfaConfigurationError,
  type ApiResponse,
  type CancelQuickLinkResponse,
  type CreateQuickLinkResponse,
  type GetQuickLinkResponse,
} from "../src/index.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  vi.unstubAllGlobals();
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("MessagingClient.quickLinks", () => {
  it("creates, retrieves, and cancels the exact hosted QuickLink resource", async () => {
    const server = await startTestServer((request) => {
      if (request.method === "POST") {
        return {
          status: 201,
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            success: true,
            data: {
              id: "ql_123",
              url: "https://connect.polymorfa.com/quicklink/token",
              session: "quicklink-123",
              expiresAt: "2026-09-08T12:15:00.000Z",
            },
          }),
        };
      }
      if (request.method === "DELETE") {
        return {
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ success: true, message: "cancelled" }),
        };
      }
      return {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          success: true,
          data: {
            id: "ql_123",
            status: "pending",
            session: "quicklink-123",
            expiresAt: "2026-09-08T12:15:00.000Z",
            openedAt: null,
            connectedAt: null,
            phone: null,
            errorCode: null,
          },
        }),
      };
    });
    servers.push(server);
    const client = new MessagingClient({
      credential: {
        type: "apiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });

    const created = await client.quickLinks.create(
      {
        projectId: "11111111-2222-4333-8444-555555555555",
        customerId: "66666666-7777-4888-8999-000000000000",
        methods: ["qr", "pairing"],
        businessName: "Acme",
        historySync: "ask",
        callbackUrl: "https://acme.example/callback",
        theme: "system",
        accent: "#6633ff",
        prefillPhone: "+15551234567",
        expiresInSeconds: 900,
      },
      { idempotencyKey: "quicklink-123" },
    );
    const retrieved = await client.quickLinks.retrieve("ql/123");
    const cancelled = await client.quickLinks.cancel("ql/123", {
      idempotencyKey: "cancel-quicklink-123",
    });

    expectTypeOf(created).toEqualTypeOf<ApiResponse<CreateQuickLinkResponse>>();
    expectTypeOf(retrieved).toEqualTypeOf<ApiResponse<GetQuickLinkResponse>>();
    expectTypeOf(cancelled).toEqualTypeOf<
      ApiResponse<CancelQuickLinkResponse>
    >();
    expect(created.data.data.id).toBe("ql_123");
    expect(retrieved.data.data.status).toBe("pending");
    expect(cancelled.data.message).toBe("cancelled");
    expect(
      server.requests.map(({ method, path }) => `${method} ${path}`),
    ).toEqual([
      "POST /messaging/quicklinks",
      "GET /messaging/quicklinks/ql%2F123",
      "DELETE /messaging/quicklinks/ql%2F123",
    ]);
    expect(server.requests[0]?.body).toContain('"expiresInSeconds":900');
    expect(server.requests[0]?.headers["idempotency-key"]).toBe(
      "quicklink-123",
    );
    expect(server.requests[2]?.headers["idempotency-key"]).toBe(
      "cancel-quicklink-123",
    );
  });

  it("accepts a project token as a server-only Messaging credential", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>(async () =>
      Response.json({
        success: true,
        data: {
          id: "ql_project",
          status: "pending",
          session: "quicklink-project",
          expiresAt: "2026-09-08T12:15:00.000Z",
          openedAt: null,
          connectedAt: null,
          phone: null,
          errorCode: null,
        },
      }),
    );
    const client = new MessagingClient({
      credential: {
        type: "projectToken",
        value: PROJECT_TOKEN,
      },
      baseUrl: "https://api.example.com",
      fetch,
    });

    await client.quickLinks.retrieve("ql_project");

    expect(
      new Headers(fetch.mock.calls[0]?.[1]?.headers).get("authorization"),
    ).toBe(`Bearer ${PROJECT_TOKEN}`);
  });

  it("rejects project tokens before transport in a browser worker", () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    vi.stubGlobal("importScripts", () => undefined);

    expect(
      () =>
        new MessagingClient({
          credential: {
            type: "projectToken",
            value: PROJECT_TOKEN,
          },
          baseUrl: "https://api.example.com",
          fetch,
        }),
    ).toThrow(PolymorfaConfigurationError);
    expect(fetch).not.toHaveBeenCalled();
  });

  it("rejects browser client tokens before transport", async () => {
    const fetch = vi.fn<typeof globalThis.fetch>();
    const client = new MessagingClient({
      credential: { type: "clientToken", value: "pmfa_ct_browser" },
      baseUrl: "https://api.example.com",
      fetch,
    });

    expect(() => client.quickLinks.retrieve("ql_123")).toThrow(
      PolymorfaConfigurationError,
    );
    expect(fetch).not.toHaveBeenCalled();
  });
});
