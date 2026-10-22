import { afterEach, expect, expectTypeOf, it } from "vitest";
import {
  Client,
  MessagingClient,
  PolymorfaConfigurationError,
  type Campaign,
  type CampaignAnalytics,
  type CampaignRecipient,
  type CampaignMessage,
  type CampaignVariableMapping,
} from "../src/index.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
const projectId = "018f0000-0000-7000-8000-000000000001",
  id = "018f0000-0000-7000-8000-000000000002";
const campaign: Campaign = {
  id,
  name: "Independent producer fixture",
  status: "draft",
  templateId: null,
  recipientListId: null,
  recipientCount: 0,
  sentCount: 0,
  deliveredCount: 0,
  readCount: 0,
  failedCount: 0,
  skippedCount: 0,
  scheduledAt: null,
  launchedAt: null,
  completedAt: null,
  createdAt: 0,
  updatedAt: 0,
  sendWindow: null,
  trackedLinks: [],
  experimentOutcome: null,
  followUp: null,
  variableMapping: null,
};
const followUps = {
  total: 0,
  waiting: 0,
  scheduled: 0,
  sending: 0,
  sent: 0,
  delivered: 0,
  read: 0,
  replied: 0,
  cancelled: 0,
  expired: 0,
  failed: 0,
  unknown: 0,
  nextDueAt: null,
};
const analytics: CampaignAnalytics = {
  campaignId: id,
  recipientCount: 0,
  sentCount: 0,
  deliveredCount: 0,
  readCount: 0,
  failedCount: 0,
  skippedCount: 0,
  respondedCount: 0,
  responseRate: 0,
  averageResponseTimeMs: null,
  minResponseTimeMs: null,
  maxResponseTimeMs: null,
  experiment: null,
  followUps,
};
const recipient: CampaignRecipient = {
  id,
  phone: "+15551234567",
  variables: {},
  variantKey: null,
  status: "failed",
  attempts: 0,
  lastError: "missing_variable",
  failureReason: "missing_variable",
  messagesSent: 0,
  nextMessageAt: null,
  sequenceError: null,
  externalMessageId: "9999999999999999999",
  queuedAt: 0,
  sentAt: null,
  deliveredAt: null,
  readAt: null,
  failedAt: null,
  respondedAt: null,
  followUp: null,
};
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});

it("retains complete independent campaign returns for all thirteen changed methods and both reports/lists", async () => {
  const server = await startTestServer((request) => {
    const path = new URL(request.path, "http://fixture").pathname;
    const data = path.endsWith("/analytics")
      ? analytics
      : path.endsWith("/recipients")
        ? [recipient]
        : request.method === "GET" && path.endsWith("/campaigns")
          ? [campaign]
          : {
              ...campaign,
              ...(path.endsWith("/stop")
                ? { operationId: null }
                : { operationId: "operation" }),
            };
    return {
      body: JSON.stringify({
        ...(path.startsWith("/messaging") ? { success: true } : {}),
        data,
        ...(path.endsWith("/recipients")
          ? { page: { nextCursor: null, hasMore: false } }
          : {}),
      }),
    };
  });
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const c = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const calls = [
    () => m.campaigns.list("p"),
    () => m.campaigns.retrieve("p", id),
    () => m.campaigns.update("p", id, { templateId: null }),
    () => m.campaigns.create("p", { name: "x", variableMapping: {} }),
    () => m.campaigns.launch("p", id, { skipMissingVariables: false }),
    () => m.campaigns.pause("p", id),
    () => m.campaigns.reschedule("p", id, { scheduledAt: 0 }),
    () => m.campaigns.resume("p", id),
    () => m.campaigns.stop("p", id),
    () => c.campaigns.list({ projectId }),
    () => c.campaigns.retrieve(id, { projectId }),
    () => c.campaigns.update(id, { trackedLinks: null }, { projectId }),
    () =>
      c.campaigns.create({
        projectId,
        name: "x",
        messagesArray: [
          {},
          { source: "x".repeat(4097), delayAfterSec: 0, extra: false },
        ],
      }),
  ];
  for (const call of calls) {
    const response = await call();
    const value = Array.isArray(response.data.data)
      ? response.data.data[0]!
      : response.data.data;
    expect(value).toMatchObject(campaign);
  }
  for (const response of [
    await m.campaigns.analytics("p", id),
    await c.campaigns.analytics(id, { projectId }),
  ]) {
    expect(response.data.data).toEqual(analytics);
    expectTypeOf(response.data.data.experiment).toEqualTypeOf<
      CampaignAnalytics["experiment"]
    >();
  }
  for (const response of [
    await m.campaigns.listRecipients("p", id, {
      reason: "missing_variable",
      cursor: "initial",
      status: "failed",
      limit: 1,
    }),
    await c.campaigns.recipients(id, {
      projectId,
      reason: "missing_variable",
      cursor: "initial",
      status: "failed",
      limit: 1,
    }),
  ])
    expect(response.data.data).toEqual([recipient]);
  expect(server.requests).toHaveLength(17);
  expect(
    server.requests.every(
      (r) => r.headers["polymorfa-version"] === "2026-09-22",
    ),
  ).toBe(true);
});

it("refuses cast-injected routes/options and preserves exact ownership", async () => {
  const server = await startTestServer(() => ({
    body: JSON.stringify({ data: campaign }),
  }));
  servers.push(server);
  const m = new MessagingClient({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    baseUrl: server.url,
  });
  for (const call of [
    () => m.campaigns.launch("p", id, {}, { path: "/wrong" } as never),
    () => m.campaigns.pause("p", id, { method: "DELETE" } as never),
    () => m.campaigns.listRecipients("p", id, { reason: null } as never),
  ])
    expect(
      await Promise.resolve()
        .then((): Promise<unknown> => call())
        .catch((e) => e),
    ).toBeInstanceOf(PolymorfaConfigurationError);
  expect(server.requests).toHaveLength(0);
});

it("exports precise shared types and keeps Messaging nullable resets separate from Platform drafts", () => {
  const mapping: CampaignVariableMapping = {
    "0": {},
    customer: { source: "name", fallback: "Friend" },
  };
  const message: CampaignMessage = {
    media: { kind: "image", url: "https://example.test/x", extension: false },
    buttons: [{ kind: "reply", label: "x", extension: 0 }],
  };
  expect(mapping["0"]).toEqual({});
  expect(message.buttons?.[0]?.extension).toBe(0);
});

for (const operation of [
  "messagingRecipients",
  "platformRecipients",
  "audienceCreate",
  "audienceMembers",
] as const) {
  it(`captures ${operation} bytes and headers across explicitly keyed replay, and sends unkeyed writes once`, async () => {
    const variables = { name: "Original" };
    const recipients = [{ phone: "+15551234567", variables }];
    const body =
      operation === "audienceCreate"
        ? { name: "Original", members: recipients }
        : operation === "audienceMembers"
          ? { members: recipients }
          : operation === "platformRecipients"
            ? { projectId, recipients }
            : { recipients };
    const headers = { "x-trace-id": "original" };
    const options = {
      idempotencyKey: "caller-selected",
      maxNetworkRetries: 1,
      headers,
    };
    let fail = true;
    const server = await startTestServer(() => {
      if (fail) {
        fail = false;
        variables.name = "Changed";
        headers["x-trace-id"] = "changed";
        options.idempotencyKey = "changed";
        if ("projectId" in body) body.projectId = id;
        return {
          status: 503,
          body: '{"error":{"code":"service_unavailable"}}',
        };
      }
      const counts = {
        added: 1,
        recipientCount: 1,
        duplicateCount: 0,
        invalidCount: 0,
        invalidRows: [],
      };
      const data =
        operation === "audienceCreate"
          ? {
              id,
              name: "Original",
              source: "api",
              recipientCount: 1,
              fileId: null,
              columns: null,
              sampleRow: null,
              mapping: null,
              createdAt: 0,
              updatedAt: 0,
              duplicateCount: 0,
              invalidCount: 0,
              invalidRows: [],
            }
          : operation === "audienceMembers"
            ? { listId: id, ...counts }
            : { campaignId: id, ...counts };
      return {
        body: JSON.stringify({
          ...(operation === "messagingRecipients" ? { success: true } : {}),
          data,
        }),
      };
    });
    servers.push(server);
    const m = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    });
    const c = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    });
    const call = (selected: typeof options | { maxNetworkRetries: number }) =>
      operation === "messagingRecipients"
        ? m.campaigns.addRecipients("original", id, body as never, selected)
        : operation === "platformRecipients"
          ? c.campaigns.addRecipients(id, body as never, selected)
          : operation === "audienceCreate"
            ? c.audiences.create(body as never, selected)
            : c.audiences.addMembers(id, body as never, selected);
    await call(options);
    expect(server.requests).toHaveLength(2);
    expect(server.requests[1]!.body).toBe(server.requests[0]!.body);
    expect(server.requests[1]!.path).toBe(server.requests[0]!.path);
    expect(server.requests.map((r) => r.headers["idempotency-key"])).toEqual([
      "caller-selected",
      "caller-selected",
    ]);
    expect(server.requests.map((r) => r.headers["x-trace-id"])).toEqual([
      "original",
      "original",
    ]);
    expect(server.requests[0]!.body).toContain('"name":"Original"');
    if (operation === "platformRecipients")
      expect(JSON.parse(server.requests[1]!.body).projectId).toBe(projectId);
    fail = true;
    await expect(call({ maxNetworkRetries: 1 })).rejects.toMatchObject({
      status: 503,
    });
    expect(server.requests).toHaveLength(3);
    expect(server.requests[2]!.headers["idempotency-key"]).toBeUndefined();
  });
}

for (const [status, code] of [
  [409, "campaign_approval_required"],
  [422, "campaign_missing_variables"],
] as const)
  it(`retains structured launch ${status} without approving or resending`, async () => {
    const server = await startTestServer(() => ({
      status,
      headers: {
        "content-type": "application/json",
        "x-request-id": "launch-refused",
        "idempotent-replayed": "false",
      },
      body: JSON.stringify({
        error: { code, message: "Refused", param: "skipMissingVariables" },
      }),
    }));
    servers.push(server);
    const c = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    });
    await expect(
      c.campaigns.launch(
        id,
        { projectId, skipMissingVariables: false },
        { maxNetworkRetries: 0 },
      ),
    ).rejects.toMatchObject({
      status,
      code,
      param: "skipMissingVariables",
      requestId: "launch-refused",
      metadata: { attempts: 1, headers: { "idempotent-replayed": "false" } },
    });
    expect(server.requests).toHaveLength(1);
  });
