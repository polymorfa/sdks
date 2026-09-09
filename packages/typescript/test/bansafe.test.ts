import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  BanSafeResource,
  Client,
  type ApiResponse,
  type BanSafeCollectionEnvelope,
  type BanSafeHealthActionsEnvelope,
  type BanSafeHealthBand,
  type BanSafeHealthEnvelope,
  type BanSafeHealthHistory,
  type BanSafeHealthPoint,
  type BanSafeSignalDefinition,
  type BanSafeTelemetryDetail,
  type BanSafeTelemetryHistoryEnvelope,
  type DataEnvelope,
  type ProjectHealthPolicy,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function testClient(): Promise<{
  client: Client;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    headers: { "content-type": "application/json" },
    body: '{"data":[],"page":{"nextCursor":null,"hasMore":false}}',
  }));
  servers.push(server);
  return {
    client: new Client({
      credential: {
        type: "organizationApiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
    requests: server.requests,
  };
}

describe("Client BanSafe resources", () => {
  it("exposes typed Health and telemetry reads without dashboard-only mutations", async () => {
    const { client, requests } = await testClient();
    expectTypeOf(client.banSafe).toEqualTypeOf<BanSafeResource>();
    expect(client.banSafe).not.toHaveProperty("acknowledgeFinding");
    expect(client.banSafe).not.toHaveProperty("appealEnforcement");

    const health = await client.banSafe.listHealth({
      projectId: "project/a",
      cursor: "cursor/a",
      limit: 25,
    });
    const detail = await client.banSafe.getHealth("session/a");
    const history = await client.banSafe.listHealthHistory("session/a", {
      since: "2026-09-07T00:00:00.000Z",
      limit: 12,
    });
    const signals = await client.banSafe.listSignals();
    const telemetry = await client.banSafe.getTelemetry("session/a");
    const telemetryHistory = await client.banSafe.listTelemetryHistory(
      "session/a",
      {
        since: "2026-09-07T00:00:00.000Z",
        until: "2026-09-08T00:00:00.000Z",
        cursor: "cursor/b",
        limit: 10,
      },
    );
    const collection = await client.banSafe.listCollection({
      projectId: "project/a",
      cursor: "cursor/c",
      limit: 25,
    });
    const actions = await client.banSafe.listHealthActions({
      projectId: "project/a",
      session: "session/a",
      status: "succeeded",
      cursor: "cursor/d",
      limit: 25,
    });

    expectTypeOf(health).toEqualTypeOf<ApiResponse<BanSafeHealthEnvelope>>();
    expectTypeOf(detail.data.data).toHaveProperty("healthEstimatorVersion");
    expectTypeOf(history).toEqualTypeOf<
      ApiResponse<DataEnvelope<BanSafeHealthHistory>>
    >();
    expectTypeOf<
      BanSafeHealthPoint["band"]
    >().toEqualTypeOf<BanSafeHealthBand | null>();
    expectTypeOf(signals).toEqualTypeOf<
      ApiResponse<DataEnvelope<readonly BanSafeSignalDefinition[]>>
    >();
    expectTypeOf(telemetry).toEqualTypeOf<
      ApiResponse<DataEnvelope<BanSafeTelemetryDetail>>
    >();
    expectTypeOf(telemetryHistory).toEqualTypeOf<
      ApiResponse<BanSafeTelemetryHistoryEnvelope>
    >();
    expectTypeOf(collection).toEqualTypeOf<
      ApiResponse<BanSafeCollectionEnvelope>
    >();
    expectTypeOf(actions).toEqualTypeOf<
      ApiResponse<BanSafeHealthActionsEnvelope>
    >();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/bansafe/health?projectId=project%2Fa&cursor=cursor%2Fa&limit=25",
      "GET /v1/bansafe/health/session%2Fa",
      "GET /v1/bansafe/health/session%2Fa/history?since=2026-09-07T00%3A00%3A00.000Z&limit=12",
      "GET /v1/bansafe/signals",
      "GET /v1/bansafe/telemetry/session%2Fa",
      "GET /v1/bansafe/telemetry/session%2Fa/history?since=2026-09-07T00%3A00%3A00.000Z&until=2026-09-08T00%3A00%3A00.000Z&cursor=cursor%2Fb&limit=10",
      "GET /v1/bansafe/collection?projectId=project%2Fa&cursor=cursor%2Fc&limit=25",
      "GET /v1/bansafe/health-actions?projectId=project%2Fa&session=session%2Fa&status=succeeded&cursor=cursor%2Fd&limit=25",
    ]);
  });

  it("maps API-key-authorized findings, enforcement, incidents, and claims", async () => {
    const { client, requests } = await testClient();
    await client.banSafe.listFindings({
      projectId: "project/a",
      session: "session/a",
      status: "open",
      severity: "critical",
      limit: 5,
    });
    await client.banSafe.listEnforcement({
      projectId: "project/a",
      rung: "throttle",
    });
    await client.banSafe.listIncidents({
      projectId: "project/a",
      session: "session/a",
    });
    await client.banSafe.createIncident(
      {
        session: "session/a",
        occurredAt: "2026-09-08T00:00:00.000Z",
        note: "WhatsApp restricted sending",
      },
      { idempotencyKey: "incident/a" },
    );
    await client.banSafe.retractIncident("incident/a");
    await client.banSafe.listClaims({
      projectId: "project/a",
      session: "session/a",
      status: "under_review",
    });
    await client.banSafe.getClaim("claim/a");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/bansafe/findings?projectId=project%2Fa&session=session%2Fa&status=open&severity=critical&limit=5",
      "GET /v1/bansafe/enforcement?projectId=project%2Fa&rung=throttle",
      "GET /v1/bansafe/incidents?projectId=project%2Fa&session=session%2Fa",
      "POST /v1/bansafe/incidents",
      "POST /v1/bansafe/incidents/incident%2Fa/retract",
      "GET /v1/bansafe/claims?projectId=project%2Fa&session=session%2Fa&status=under_review",
      "GET /v1/bansafe/claims/claim%2Fa",
    ]);
    expect(requests[3]?.headers["idempotency-key"]).toBe("incident/a");
    expect(JSON.parse(requests[3]!.body)).toEqual({
      session: "session/a",
      occurredAt: "2026-09-08T00:00:00.000Z",
      note: "WhatsApp restricted sending",
    });
  });

  it("maps project and session safety settings to their typed owners", async () => {
    const { client, requests } = await testClient();
    await client.projects.getSafeMode("project/a");
    await client.projects.updateSafeMode("project/a", { pacing: "jittered" });
    await client.projects.getWarmupPlan("project/a");
    await client.projects.updateWarmupPlan("project/a", {
      enabled: true,
      warmupDays: 30,
      dailyStart: 20,
    });
    await client.projects.getInsuranceEvidence("project/a");
    await client.projects.updateInsuranceEvidence("project/a", {
      enabled: true,
    });
    const policy = await client.projects.getHealthPolicy("project/a");
    await client.projects.updateHealthPolicy("project/a", {
      version: 4,
      enabled: true,
      threshold: 50,
      sessionAction: "slow_down",
      slowDownMps: 0.5,
      emailNotification: true,
      webhookNotification: true,
    });
    await client.sessions.getSafeMode("session/a");
    await client.sessions.updateSafeMode("session/a", { typing: "inherit" });

    expectTypeOf(policy).toEqualTypeOf<
      ApiResponse<DataEnvelope<ProjectHealthPolicy>>
    >();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/projects/project%2Fa/safe-mode",
      "PUT /v1/projects/project%2Fa/safe-mode",
      "GET /v1/projects/project%2Fa/warmup-plan",
      "PUT /v1/projects/project%2Fa/warmup-plan",
      "GET /v1/projects/project%2Fa/insurance-evidence",
      "PUT /v1/projects/project%2Fa/insurance-evidence",
      "GET /v1/projects/project%2Fa/health-policy",
      "PUT /v1/projects/project%2Fa/health-policy",
      "GET /v1/sessions/session%2Fa/safe-mode",
      "PUT /v1/sessions/session%2Fa/safe-mode",
    ]);
  });
});
