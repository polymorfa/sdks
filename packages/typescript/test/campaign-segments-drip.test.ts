import { readFileSync } from "node:fs";
import { afterEach, expect, expectTypeOf, it } from "vitest";
import {
  Client,
  MessagingClient,
  PolymorfaConflictError,
  PolymorfaAuthorizationError,
  type AudienceSegmentRules,
  type UpdateCampaignRequest,
  type CampaignDripPatch,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
const rules: AudienceSegmentRules = {
  match: "all",
  groups: [
    {
      match: "any",
      conditions: [
        { field: "tag", operator: "contains", value: "vip" },
        {
          field: "attribute",
          name: "spend",
          operator: "greater_than",
          value: 100,
        },
        { field: "consent", operator: "equals", value: true },
      ],
    },
  ],
};
function platform(url: string) {
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: url,
    maxNetworkRetries: 2,
  });
}
function messaging(url: string) {
  return new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: url,
    maxNetworkRetries: 2,
  });
}
it("preserves segment rules, revision guards, pagination and both previews", async () => {
  const server = await startTestServer(() => ({
    body: JSON.stringify({
      data: { id: "s", rules, revision: 2 },
      page: { hasMore: false, nextCursor: null },
    }),
  }));
  servers.push(server);
  const segments = platform(server.url).audienceSegments;
  await segments.list({ limit: 10, cursor: "next" });
  await segments.retrieve("s/1");
  await segments.create({ name: "VIP", rules });
  await segments.update("s", { expectedRevision: 1, rules });
  await segments.preview("s");
  await segments.previewRules(rules);
  await segments.delete("s", 2);
  expect(server.requests.map((r) => [r.method, r.path])).toEqual([
    ["GET", "/platform/audience-segments?limit=10&cursor=next"],
    ["GET", "/platform/audience-segments/s%2F1"],
    ["POST", "/platform/audience-segments"],
    ["PATCH", "/platform/audience-segments/s"],
    ["GET", "/platform/audience-segments/s/preview"],
    ["POST", "/platform/audience-segments/preview"],
    ["DELETE", "/platform/audience-segments/s?expectedRevision=2"],
  ]);
  expect(JSON.parse(server.requests[3]!.body)).toEqual({
    expectedRevision: 1,
    rules,
  });
});
it.each([
  [403, "feature_unavailable"],
  [403, "permission_denied"],
  [409, "state_conflict"],
] as const)("preserves %s %s without write retry", async (status, code) => {
  const server = await startTestServer(() => ({
    status,
    body: JSON.stringify({
      error: {
        code,
        message: "Unavailable, deleted segment or evaluation timeout",
      },
    }),
  }));
  servers.push(server);
  const p = platform(server.url).audienceSegments.update("s", {
    expectedRevision: 2,
    name: "new",
  });
  await expect(p).rejects.toBeInstanceOf(
    status === 409 ? PolymorfaConflictError : PolymorfaAuthorizationError,
  );
  await expect(p).rejects.toMatchObject({ status, code });
  expect(server.requests).toHaveLength(1);
});
it("preserves partial drip PATCH on both APIs and idempotent enrollment responses", async () => {
  const server = await startTestServer(() => ({
    body: JSON.stringify({
      success: true,
      data: {
        created: false,
        status: "skipped",
        drip: {
          enrollment: "audience",
          exitOnReply: false,
          exitOnLinkClick: true,
        },
        enrollmentOpen: false,
        pauseReason: null,
        segmentSnapshot: { revision: 3, evaluatedAt: 1, matchedCount: 4 },
      },
    }),
  }));
  servers.push(server);
  const client = platform(server.url),
    m = messaging(server.url);
  const drip: CampaignDripPatch = { enrollment: "audience" };
  const patch: UpdateCampaignRequest = { drip };
  await client.campaigns.create({
    projectId: "11111111-1111-4111-8111-111111111111",
    name: "VIP drip",
    segmentId: "s",
    drip: { enrollment: "continuous" },
    messagesArray: [
      { source: "hi" },
      {
        source: "later",
        delayAfterSec: 2592000,
        delayUnit: "days",
        sendWindow: {
          days: ["monday"],
          hours: [{ start: "09:00", end: "17:00" }],
        },
      },
    ],
  });
  await client.campaigns.update(
    "c",
    { drip },
    { projectId: "11111111-1111-4111-8111-111111111111" },
  );
  await m.campaigns.update("11111111-1111-4111-8111-111111111111", "c", patch);
  expect(server.requests.slice(1).map((r) => JSON.parse(r.body))).toEqual([
    { drip: { enrollment: "audience" } },
    { drip: { enrollment: "audience" } },
  ]);
  expect(
    (
      await client.campaigns.enroll("c", {
        projectId: "11111111-1111-4111-8111-111111111111",
        phone: "+5511999990000",
      })
    ).data.data.created,
  ).toBe(false);
  expect(
    (
      await m.campaigns.enroll("11111111-1111-4111-8111-111111111111", "c", {
        phone: "+5511999990000",
        variables: { vip: true },
      })
    ).data.data.status,
  ).toBe("skipped");
  expect(server.requests.slice(3).map((r) => r.path)).toEqual([
    "/platform/campaigns/c/enrollments",
    "/messaging/projects/11111111-1111-4111-8111-111111111111/campaigns/c/enrollments",
  ]);
  const campaign = (
    await m.campaigns.retrieve("11111111-1111-4111-8111-111111111111", "c")
  ).data.data;
  expect(campaign.enrollmentOpen).toBe(false);
  expect(campaign.segmentSnapshot?.revision).toBe(3);
});
it("pins PATCH defaults, four-range step windows, and segment bounds to merged dev", () => {
  const contract = JSON.parse(
    readFileSync(
      new URL(
        "../../../contracts/campaign-segments-drip.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(contract.commit).toBe("f46ebd5162453e812dafa76ce02b420ddabe6921");
  for (const source of Object.values(contract.sources) as {
    sourceSha256: string;
    schemas: Record<string, { properties: Record<string, unknown> }>;
  }[]) {
    expect(source.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(JSON.stringify(source.schemas.CampaignDripPatch)).not.toContain(
      '"default"',
    );
  }
  expect(
    contract.sources.platform.fields["CampaignMessage.sendWindow"].properties
      .hours.maxItems,
  ).toBe(4);
  expect(
    contract.sources.platform.schemas.AudienceSegmentRules.properties.groups
      .maxItems,
  ).toBe(10);
});

it.each([
  "The saved segment was deleted; this launched campaign cannot launch again",
  "Segment evaluation exceeded its time limit; simplify the rules and retry",
])("preserves launch 409: %s", async (message) => {
  const server = await startTestServer(() => ({
    status: 409,
    body: JSON.stringify({ error: { code: "state_conflict", message } }),
  }));
  servers.push(server);
  const result = platform(server.url).campaigns.launch(
    "c",
    { projectId: "11111111-1111-4111-8111-111111111111" },
    { maxNetworkRetries: 0 },
  );
  await expect(result).rejects.toMatchObject({
    status: 409,
    code: "state_conflict",
    message,
  });
  expect(server.requests).toHaveLength(1);
});
it("projects per-step analytics and recipient exits on both APIs", async () => {
  const drip = {
    enrollment: "continuous",
    enrolled: 3,
    enrolledByApi: 1,
    active: 1,
    completed: 1,
    exited: 1,
    steps: [
      {
        step: 0,
        entered: 3,
        waiting: 1,
        sent: 2,
        delivered: 2,
        read: 1,
        replied: 1,
        exited: 1,
        failed: 0,
      },
    ],
  };
  const server = await startTestServer((request) => ({
    body: JSON.stringify({
      success: true,
      data: request.path.includes("analytics")
        ? { drip }
        : [
            {
              messagesSent: 1,
              nextMessageAt: null,
              sequenceError: "link_clicked",
            },
          ],
      page: { hasMore: false, nextCursor: null },
    }),
  }));
  servers.push(server);
  expect(
    (
      await platform(server.url).campaigns.analytics("c", {
        projectId: "11111111-1111-4111-8111-111111111111",
      })
    ).data.data.drip,
  ).toEqual(drip);
  expect(
    (
      await messaging(server.url).campaigns.analytics(
        "11111111-1111-4111-8111-111111111111",
        "c",
      )
    ).data.data.drip?.steps[0]?.exited,
  ).toBe(1);
  expect(
    (
      await platform(server.url).campaigns.recipients("c", {
        projectId: "11111111-1111-4111-8111-111111111111",
      })
    ).data.data[0]?.sequenceError,
  ).toBe("link_clicked");
  expect(
    (
      await messaging(server.url).campaigns.listRecipients(
        "11111111-1111-4111-8111-111111111111",
        "c",
      )
    ).data.data[0]?.messagesSent,
  ).toBe(1);
});

it("surfaces saved preview timeout once so the caller can simplify rules", async () => {
  const server = await startTestServer(() => ({
    status: 409,
    body: JSON.stringify({
      error: { code: "state_conflict", message: "Simplify rules and retry" },
    }),
  }));
  servers.push(server);
  await expect(
    platform(server.url).audienceSegments.preview("s"),
  ).rejects.toMatchObject({ status: 409, code: "state_conflict" });
  expect(server.requests).toHaveLength(1);
});

it("requires organization project context and keeps segment authority out of project clients", () => {
  const client = platform("https://api.example.test");
  expectTypeOf<Parameters<typeof client.campaigns.enroll>[1]>().toMatchTypeOf<{
    readonly projectId: string;
  }>();
  expect(
    client.project("11111111-1111-4111-8111-111111111111"),
  ).not.toHaveProperty("audienceSegments");
  type Create = Parameters<typeof client.campaigns.create>[0];
  const valid: Create = {
    projectId: "11111111-1111-4111-8111-111111111111",
    name: "draft",
  };
  const invalid: Create = {
    projectId: "11111111-1111-4111-8111-111111111111",
    name: "draft",
    // @ts-expect-error The create schema permits omission, not null.
    segmentId: null,
  };
  expect(valid.name).toBe(invalid.name);
});

it("preserves ordinary sequence bounds and accepts later drip steps on PATCH", async () => {
  const server = await startTestServer(() => ({
    body: JSON.stringify({ success: true, data: {} }),
  }));
  servers.push(server);
  const client = platform(server.url);
  const projectId = "11111111-1111-4111-8111-111111111111";
  expect(() =>
    client.campaigns.create({
      projectId,
      name: "ordinary",
      messagesArray: [{ source: "later", delayAfterSec: 86401 }],
    }),
  ).toThrow("delayAfterSec");
  expect(server.requests).toHaveLength(0);
  await client.campaigns.update(
    "c",
    {
      messagesArray: [
        { source: "later", delayAfterSec: 2592000, delayUnit: "days" },
      ],
    },
    { projectId },
  );
  expect(JSON.parse(server.requests[0]!.body)).toEqual({
    messagesArray: [
      { source: "later", delayAfterSec: 2592000, delayUnit: "days" },
    ],
  });
  expect(() =>
    client.campaigns.update(
      "c",
      { messagesArray: [{ source: "later", delayAfterSec: 2592001 }] },
      { projectId },
    ),
  ).toThrow("delayAfterSec");
  expect(server.requests).toHaveLength(1);
});
