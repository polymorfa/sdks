import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  Client,
  PolymorfaAuthorizationError,
  PolymorfaServerError,
  UsageResource,
  type ApiResponse,
  type UsageGateList,
  type UsageMeter,
  type UsageRecord,
  type UsageRecordPage,
  type UsageRecordedPayload,
  type UsageSummary,
  type UsageUnit,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import {
  startTestServer,
  type RecordedRequest,
  type TestServer,
} from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const meterTotal = {
  meter: "call.duration",
  unit: "second",
  keySource: "none",
  quantity: 5400,
  records: 42,
};
const summary: UsageSummary = {
  period: "2026-09",
  start: "2026-09-01T00:00:00.000Z",
  end: "2026-10-01T00:00:00.000Z",
  projectId: null,
  session: null,
  billingEnabled: false,
  meters: [meterTotal],
  numbers: [
    { session: "support", projectId: "project-1", meters: [meterTotal] },
  ],
  numbersTruncated: false,
} as UsageSummary;
const record: UsageRecord = {
  id: "11111111-1111-4111-8111-111111111111",
  meter: "call.duration",
  quantity: 42,
  unit: "second",
  dimensions: {
    direction: "outbound",
    upstream: "linked_device",
    origin: "direct",
    participants: 1,
    connections: 1,
    sipLegs: 0,
    video: false,
  },
  keySource: "none",
  sourceKind: "call",
  sourceId: "CALL-1",
  projectId: "project-1",
  session: "support",
  occurredAt: "2026-09-19T10:00:00.000Z",
  recordedAt: "2026-09-19T10:00:01.000Z",
  revision: 1,
  pricingState: "unpriced",
  rateCard: null,
  pricedCredits: null,
};
const gates: UsageGateList = {
  session: "support",
  gates: [
    {
      key: "calls.outbound_monthly",
      kind: "quota",
      subject: "number",
      mode: "record",
      active: true,
      limit: 50,
      used: 4,
      unit: "call",
      overLimit: false,
      decisions: { wouldBlock: 2, blocked: 0, evaluationError: 0 },
    },
  ],
};

async function usageServer(
  body: (request: RecordedRequest) => string,
  credential: "organizationApiKey" | "projectToken" = "organizationApiKey",
): Promise<{
  client: Client<"organization"> | Client<"project">;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_usage",
    },
    body: body(request),
  }));
  servers.push(server);
  const client =
    credential === "projectToken"
      ? new Client({
          credential: { type: "projectToken", value: PROJECT_TOKEN },
          projectId: "project-1",
          baseUrl: server.url,
          maxNetworkRetries: 0,
        })
      : new Client({
          credential: {
            type: "organizationApiKey",
            value: ORGANIZATION_API_KEY,
          },
          baseUrl: server.url,
          maxNetworkRetries: 0,
        });
  return { requests: server.requests, client };
}

describe("Client.usage", () => {
  it("exports the usage resource and record contract", () => {
    expectTypeOf<Client["usage"]>().toEqualTypeOf<UsageResource>();
    expectTypeOf<UsageRecord>().toHaveProperty("revision");
    expectTypeOf<UsageRecord>().toHaveProperty("pricingState");
    expectTypeOf<UsageSummary>().toHaveProperty("billingEnabled");
  });

  it("types the usage.recorded webhook payload with the closed enums", () => {
    expectTypeOf<UsageRecordedPayload["meter"]>().toEqualTypeOf<UsageMeter>();
    expectTypeOf<UsageRecordedPayload["unit"]>().toEqualTypeOf<UsageUnit>();
    expectTypeOf<UsageRecordedPayload>().toEqualTypeOf<UsageRecord>();
  });

  it("reads a month's usage and unwraps the data envelope", async () => {
    const { client, requests } = await usageServer(() =>
      JSON.stringify({ data: summary }),
    );
    const response = await client.usage.summary({
      period: "2026-09",
      session: "support",
    });
    expectTypeOf(response).toEqualTypeOf<ApiResponse<UsageSummary>>();
    expect(response.data).toEqual(summary);
    expect(requests[0]!.path).toBe(
      "/platform/usage?period=2026-09&session=support",
    );
  });

  it("filters records by call and pages through them", async () => {
    const first = JSON.stringify({
      data: { records: [record], nextCursor: "cursor-2" },
    });
    const second = JSON.stringify({
      data: { records: [{ ...record, revision: 2 }], nextCursor: null },
    });
    const { client, requests } = await usageServer((request) =>
      request.path.includes("cursor=") ? second : first,
    );
    const page = await client.usage.listRecords({
      callId: "CALL-1",
      meter: "call.duration",
      limit: 1,
    });
    expectTypeOf(page).toEqualTypeOf<ApiResponse<UsageRecordPage>>();
    expect(page.data.records).toEqual([record]);
    expect(requests[0]!.path).toBe(
      "/platform/usage/records?callId=CALL-1&meter=call.duration&limit=1",
    );

    const seen: number[] = [];
    for await (const item of client.usage.iterateRecords({
      session: "support",
    }))
      seen.push(item.revision);
    expect(seen).toEqual([1, 2]);
    expect(requests[2]!.path).toBe(
      "/platform/usage/records?session=support&cursor=cursor-2",
    );
  });

  it("rejects a repeated record cursor before yielding its page", async () => {
    const { client, requests } = await usageServer(() =>
      JSON.stringify({
        data: {
          records: [{ ...record, revision: requests.length }],
          nextCursor: "a",
        },
      }),
    );
    const revisions: number[] = [];
    const walk = async () => {
      for await (const item of client.usage.iterateRecords()) {
        revisions.push(item.revision);
      }
    };
    await expect(walk()).rejects.toBeInstanceOf(PolymorfaServerError);
    expect(requests).toHaveLength(2);
    expect(revisions).toEqual([1]);
  });

  it("reads gate state for one number", async () => {
    const { client, requests } = await usageServer(() =>
      JSON.stringify({ data: gates }),
    );
    const response = await client.usage.listGates({ session: "support" });
    expectTypeOf(response).toEqualTypeOf<ApiResponse<UsageGateList>>();
    expect(response.data.gates[0]!.mode).toBe("record");
    expect(requests[0]!.path).toBe("/platform/gates?session=support");
  });

  it("binds a project client to its own project", async () => {
    const { client, requests } = await usageServer(
      () => JSON.stringify({ data: summary }),
      "projectToken",
    );
    await client.usage.summary({ projectId: "another-project" });
    expect(requests[0]!.path).toBe("/platform/usage?projectId=project-1");
  });

  it("preserves the API's refusal of project credentials for team gate state", async () => {
    const server = await startTestServer(() => ({
      status: 403,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: {
          code: "permission_denied",
          message: "Usage gates require a team credential.",
        },
        data: null,
      }),
    }));
    servers.push(server);
    const client = new Client({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      projectId: "project-1",
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    await expect(client.usage.listGates()).rejects.toBeInstanceOf(
      PolymorfaAuthorizationError,
    );
    expect(server.requests[0]!.path).toBe(
      "/platform/gates?projectId=project-1",
    );
  });
});
