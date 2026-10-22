import { readFileSync } from "node:fs";
import { afterEach, expect, expectTypeOf, it } from "vitest";
import {
  Client,
  MessagingClient,
  PolymorfaConflictError,
  PolymorfaAuthorizationError,
  type CampaignFrequencyCap,
  type UpdateCampaignRequest,
  type CreatePlatformCampaignRequest,
  type UpdatePlatformCampaignRequest,
  type CampaignRecipientFailureReason,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
const limits = {
  maxPer24Hours: 2,
  maxPer7Days: 5,
} satisfies CampaignFrequencyCap;
const settings = {
  ...limits,
  teamId: "team",
  revision: 1,
  updatedAt: 1800000000000,
};
const contract = JSON.parse(
  readFileSync(
    new URL("../../../contracts/campaign-frequency-cap.json", import.meta.url),
    "utf8",
  ),
);
it("pins bounds, fields, errors and reason filters to the merged contract", () => {
  expect(contract.commit).toBe("9bb1e2ed92d8b4a07ff727f8e7ae185498f0868f");
  for (const source of Object.values(contract.sources) as {
    sourceSha256: string;
    fields: Record<string, unknown>;
  }[]) {
    expect(source.sourceSha256).toMatch(/^[a-f0-9]{64}$/);
    expect(
      Object.keys(source.fields).some((k) => k.endsWith(".frequencyCap")),
    ).toBe(true);
  }
  const schema = contract.sources.platform.schemas;
  expect(schema.UpdateCampaignFrequencyCapInput.required).toEqual([
    "maxPer24Hours",
    "maxPer7Days",
    "revision",
  ]);
  expect(
    schema.UpdateCampaignFrequencyCapInput.properties.maxPer24Hours.maximum,
  ).toBe(50);
  expect(
    schema.UpdateCampaignFrequencyCapInput.properties.maxPer7Days.maximum,
  ).toBe(200);
  const reason: CampaignRecipientFailureReason = "frequency_cap";
  expect(schema.CampaignRecipientFailureReason.enum).toContain(reason);
  expectTypeOf<UpdateCampaignRequest>().toMatchTypeOf<{
    readonly frequencyCap?: CampaignFrequencyCap | null;
  }>();
  const create: CreatePlatformCampaignRequest = {
    name: "cap",
    projectId: "11111111-1111-4111-8111-111111111111",
    frequencyCap: limits,
  };
  const update: UpdatePlatformCampaignRequest = { frequencyCap: null };
  expect([create.frequencyCap, update.frequencyCap]).toEqual([limits, null]);
});
it("reads, replaces and removes team limits with the observed revision", async () => {
  const server = await startTestServer((request, i) => ({
    body: JSON.stringify({
      data: {
        ...settings,
        ...(request.body ? JSON.parse(request.body) : {}),
        revision: i + 1,
      },
    }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const read = await client.campaigns.getFrequencyCap();
  const saved = await client.campaigns.updateFrequencyCap({
    ...limits,
    revision: read.data.data.revision,
  });
  await client.campaigns.updateFrequencyCap({
    maxPer24Hours: null,
    maxPer7Days: null,
    revision: saved.data.data.revision,
  });
  expect(server.requests.map((r) => [r.method, r.path])).toEqual([
    ["GET", "/platform/campaign-settings/frequency-cap"],
    ["PUT", "/platform/campaign-settings/frequency-cap"],
    ["PUT", "/platform/campaign-settings/frequency-cap"],
  ]);
  expect(JSON.parse(server.requests[2]!.body)).toEqual({
    maxPer24Hours: null,
    maxPer7Days: null,
    revision: 2,
  });
});
it.each([
  [409, "conflict", PolymorfaConflictError],
  [403, "feature_unavailable", PolymorfaAuthorizationError],
] as const)(
  "preserves %s errors without retrying the write",
  async (status, code, ErrorClass) => {
    const server = await startTestServer(() => ({
      status,
      body: JSON.stringify({
        error: { code, message: "Cap unavailable or stale" },
      }),
    }));
    servers.push(server);
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 2,
    });
    const result = client.campaigns.updateFrequencyCap({
      ...limits,
      revision: 0,
    });
    await expect(result).rejects.toBeInstanceOf(ErrorClass);
    await expect(result).rejects.toMatchObject({ status, code });
    expect(server.requests).toHaveLength(1);
  },
);
it("passes cap fields and recipient reason filters through both audiences", async () => {
  const server = await startTestServer(() => ({
    body: JSON.stringify({
      success: true,
      data: { frequencyCap: limits },
      page: { hasMore: false, nextCursor: null },
    }),
  }));
  servers.push(server);
  const config = {
    credential: {
      type: "organizationApiKey" as const,
      value: ORGANIZATION_API_KEY,
    },
    baseUrl: server.url,
  };
  const client = new Client(config);
  const messaging = new MessagingClient({
    ...config,
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
  });
  await client.campaigns.create({
    name: "cap",
    projectId: "11111111-1111-4111-8111-111111111111",
    frequencyCap: limits,
  });
  await client.campaigns.update(
    "c",
    { frequencyCap: null },
    { projectId: "11111111-1111-4111-8111-111111111111" },
  );
  await messaging.campaigns.create("11111111-1111-4111-8111-111111111111", {
    name: "cap",
    frequencyCap: limits,
  });
  await messaging.campaigns.update(
    "11111111-1111-4111-8111-111111111111",
    "c",
    { frequencyCap: null },
  );
  await client.campaigns.recipients("c", {
    projectId: "11111111-1111-4111-8111-111111111111",
    status: "skipped",
    reason: "frequency_cap",
  });
  await messaging.campaigns.listRecipients(
    "11111111-1111-4111-8111-111111111111",
    "c",
    {
      status: "skipped",
      reason: "frequency_cap",
    },
  );
  expect(
    server.requests.slice(0, 4).map((r) => JSON.parse(r.body).frequencyCap),
  ).toEqual([limits, null, limits, null]);
  expect(
    server.requests
      .slice(4)
      .every((r) => r.path.includes("reason=frequency_cap")),
  ).toBe(true);
});

it("preserves cap reads, skip analytics and recipient reasons on both surfaces", async () => {
  const server = await startTestServer((request) => ({
    body: JSON.stringify({
      success: true,
      data: request.path.includes("/analytics")
        ? { frequencyCap: { skippedRecipientCount: 3 } }
        : request.path.includes("/recipients")
          ? [
              {
                failureReason: "frequency_cap",
                lastError: "frequency_cap_exceeded",
              },
            ]
          : { frequencyCap: limits },
      page: { hasMore: false, nextCursor: null },
    }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const messaging = new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  expect(
    (
      await client.campaigns.retrieve("c", {
        projectId: "11111111-1111-4111-8111-111111111111",
      })
    ).data.data?.frequencyCap,
  ).toEqual(limits);
  expect(
    (
      await messaging.campaigns.retrieve(
        "11111111-1111-4111-8111-111111111111",
        "c",
      )
    ).data.data.frequencyCap,
  ).toEqual(limits);
  expect(
    (
      await client.campaigns.analytics("c", {
        projectId: "11111111-1111-4111-8111-111111111111",
      })
    ).data.data.frequencyCap?.skippedRecipientCount,
  ).toBe(3);
  expect(
    (
      await messaging.campaigns.analytics(
        "11111111-1111-4111-8111-111111111111",
        "c",
      )
    ).data.data.frequencyCap?.skippedRecipientCount,
  ).toBe(3);
  expect(
    (
      await client.campaigns.recipients("c", {
        projectId: "11111111-1111-4111-8111-111111111111",
      })
    ).data.data[0]?.failureReason,
  ).toBe("frequency_cap");
  expect(
    (
      await messaging.campaigns.listRecipients(
        "11111111-1111-4111-8111-111111111111",
        "c",
      )
    ).data.data[0]?.failureReason,
  ).toBe("frequency_cap");
});
