import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  PlatformClient,
  WidgetSettingsResource,
  type ApiResponse,
  type DataEnvelope,
  type SessionBatchRemoveResult,
  type SessionBatchStopResult,
  type WidgetSettings,
} from "../src/index.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function platformServer(): Promise<{
  client: PlatformClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_platform_widget_sessions",
    },
    body: '{"data":{"id":"fixture"}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new PlatformClient({
      apiKey: "pmfa_platform",
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("PlatformClient widget settings", () => {
  it("exports the exact settings resource and typed wire shape", () => {
    expectTypeOf<
      PlatformClient["widgetSettings"]
    >().toEqualTypeOf<WidgetSettingsResource>();
    expectTypeOf<WidgetSettings>().toHaveProperty("modesAllowed");
    expectTypeOf<WidgetSettings>().toHaveProperty("allowedOrigins");
    expectTypeOf<WidgetSettings>().toHaveProperty("qrLogoMode");
    expectTypeOf<WidgetSettings>().toHaveProperty("createdAt");
  });

  it("retrieves organization or project settings with response metadata", async () => {
    const { client, requests } = await platformServer();

    const organization = await client.widgetSettings.retrieve();
    const project = await client.widgetSettings.retrieve(
      { projectId: "project/a" },
      { apiVersion: "next" },
    );

    expectTypeOf(organization).toEqualTypeOf<
      ApiResponse<DataEnvelope<WidgetSettings | null>>
    >();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/widget",
      "GET /v1/widget?projectId=project%2Fa",
    ]);
    expect(requests[1]?.headers["polymorfa-version"]).toBe("next");
    expect(project.metadata.requestId).toBe("req_platform_widget_sessions");
  });

  it("updates only source-defined settings and forwards idempotency", async () => {
    const { client, requests } = await platformServer();

    const updated = await client.widgetSettings.update(
      {
        projectId: "11111111-2222-4333-8444-555555555555",
        enabled: true,
        modesAllowed: ["embedded", "redirect"],
        methods: ["qr", "pairing", "cloud-api"],
        allowedRedirectUris: ["https://example.test/callback"],
        allowedOrigins: ["https://example.test"],
        businessName: "Support",
        accent: "#6A3DE8",
        theme: "system",
        hideWatermark: false,
        colors: { dark: { primary: "#6A3DE8" } },
        shape: "rounded",
        radiusPx: 16,
        qrLogoMode: "custom",
        qrLogoStorageId: "logo/a",
        qrLogoSourceStorageId: "source/a",
        historySync: "ask",
      },
      { idempotencyKey: "widget-settings-1" },
    );

    expectTypeOf(updated).toEqualTypeOf<
      ApiResponse<DataEnvelope<WidgetSettings>>
    >();
    expect(requests[0]).toMatchObject({
      method: "PUT",
      path: "/v1/widget",
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("widget-settings-1");
    expect(JSON.parse(requests[0]?.body ?? "{}")).toEqual({
      projectId: "11111111-2222-4333-8444-555555555555",
      enabled: true,
      modesAllowed: ["embedded", "redirect"],
      methods: ["qr", "pairing", "cloud-api"],
      allowedRedirectUris: ["https://example.test/callback"],
      allowedOrigins: ["https://example.test"],
      businessName: "Support",
      accent: "#6A3DE8",
      theme: "system",
      hideWatermark: false,
      colors: { dark: { primary: "#6A3DE8" } },
      shape: "rounded",
      radiusPx: 16,
      qrLogoMode: "custom",
      qrLogoStorageId: "logo/a",
      qrLogoSourceStorageId: "source/a",
      historySync: "ask",
    });
  });
});

describe("PlatformClient batch session lifecycle", () => {
  it("requests bounded asynchronous stops without inventing per-item results", async () => {
    const { client, requests } = await platformServer();

    const stopped = await client.sessions.stopMany(
      {
        projectId: "project/a",
        sessionIds: ["support", "session/a"],
      },
      { idempotencyKey: "stop-sessions-1" },
    );

    expectTypeOf(stopped).toEqualTypeOf<
      ApiResponse<DataEnvelope<SessionBatchStopResult>>
    >();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/sessions/stop",
      body: '{"projectId":"project/a","sessionIds":["support","session/a"]}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("stop-sessions-1");
  });

  it("permanently removes a bounded session set", async () => {
    const { client, requests } = await platformServer();

    const removed = await client.sessions.deleteMany(
      { sessionIds: ["support", "sales"] },
      { idempotencyKey: "delete-sessions-1" },
    );

    expectTypeOf(removed).toEqualTypeOf<
      ApiResponse<DataEnvelope<SessionBatchRemoveResult>>
    >();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/v1/sessions/delete",
      body: '{"sessionIds":["support","sales"]}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("delete-sessions-1");
    expect(removed.metadata.requestId).toBe("req_platform_widget_sessions");
  });
});
