import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingCampaignsResource,
  MessagingClient,
  type ApiResponse,
  type Campaign,
  type CampaignAnalytics,
  type CampaignOperationResponse,
  type CampaignRequeueResponse,
  type CreateCampaignResponse,
  type GetCampaignResponse,
  type ListCampaignsResponse,
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

const campaign = {
  id: "018f0000-0000-7000-8000-000000000001",
  name: "August launch",
  status: "draft",
  templateId: "018f0000-0000-7000-8000-000000000002",
  recipientListId: null,
  recipientCount: 50,
  sentCount: 0,
  deliveredCount: 0,
  readCount: 0,
  failedCount: 0,
  skippedCount: 0,
  scheduledAt: null,
  launchedAt: null,
  completedAt: null,
  createdAt: 1_724_000_000_000,
  updatedAt: 1_724_000_000_000,
};

async function campaignsServer(): Promise<{
  client: MessagingClient;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => ({
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_messaging_campaigns",
    },
    body: request.path.endsWith("/analytics")
      ? JSON.stringify({
          success: true,
          data: {
            campaignId: campaign.id,
            recipientCount: 50,
            sentCount: 30,
            deliveredCount: 25,
            readCount: 20,
            failedCount: 2,
            skippedCount: 1,
            respondedCount: 5,
            responseRate: 0.1,
          },
        })
      : request.path.endsWith("/requeue")
        ? '{"success":true,"data":{"requeued":3}}'
        : request.method === "GET" && !request.path.endsWith(campaign.id)
          ? JSON.stringify({ success: true, data: [campaign] })
          : JSON.stringify({
              success: true,
              data:
                request.path.endsWith("/launch") ||
                request.path.endsWith("/pause") ||
                request.path.endsWith("/resume") ||
                request.path.endsWith("/stop")
                  ? {
                      ...campaign,
                      operationId: "018f0000-0000-7000-8000-000000000003",
                    }
                  : campaign,
            }),
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new MessagingClient({
      credential: {
        type: "apiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("MessagingClient campaigns", () => {
  it("exports the exact resource and live campaign contracts", () => {
    expectTypeOf<
      MessagingClient["campaigns"]
    >().toEqualTypeOf<MessagingCampaignsResource>();
    expectTypeOf<Campaign>().toHaveProperty("recipientCount");
    expectTypeOf<Campaign>().toHaveProperty("scheduledAt");
    expectTypeOf<CampaignAnalytics>().toHaveProperty("responseRate");
  });

  it("maps complete project reads without inventing pagination", async () => {
    const { client, requests } = await campaignsServer();

    const listed = await client.campaigns.list("launch/eu", {
      apiVersion: "next",
    });
    const retrieved = await client.campaigns.retrieve("launch/eu", campaign.id);
    const analytics = await client.campaigns.analytics(
      "launch/eu",
      campaign.id,
    );

    expectTypeOf(listed).toEqualTypeOf<ApiResponse<ListCampaignsResponse>>();
    expectTypeOf(retrieved).toEqualTypeOf<ApiResponse<GetCampaignResponse>>();
    expectTypeOf(analytics.data.data).toEqualTypeOf<CampaignAnalytics>();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /messaging/projects/launch%2Feu/campaigns",
      `GET /messaging/projects/launch%2Feu/campaigns/${campaign.id}`,
      `GET /messaging/projects/launch%2Feu/campaigns/${campaign.id}/analytics`,
    ]);
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
    expect(listed.metadata.requestId).toBe("req_messaging_campaigns");
  });

  it("creates the exact source-defined draft payload", async () => {
    const { client, requests } = await campaignsServer();

    const created = await client.campaigns.create(
      "launch/eu",
      {
        name: "August launch",
        templateId: "template/a",
        recipientListId: "audience/a",
        senderConfig: { retry: { maxAttempts: 5 } },
        scheduledAt: 1_724_086_800_000,
      },
      { idempotencyKey: "campaign-create-august" },
    );

    expectTypeOf(created).toEqualTypeOf<ApiResponse<CreateCampaignResponse>>();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/messaging/projects/launch%2Feu/campaigns",
      body: JSON.stringify({
        name: "August launch",
        templateId: "template/a",
        recipientListId: "audience/a",
        senderConfig: { retry: { maxAttempts: 5 } },
        scheduledAt: 1_724_086_800_000,
      }),
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe(
      "campaign-create-august",
    );
  });

  it("submits durable lifecycle commands with operation IDs", async () => {
    const { client, requests } = await campaignsServer();

    const launched = await client.campaigns.launch(
      "launch/eu",
      campaign.id,
      { scheduledAt: 1_724_086_800_000 },
      { idempotencyKey: "campaign-launch-august" },
    );
    const paused = await client.campaigns.pause("launch/eu", campaign.id);
    await client.campaigns.resume("launch/eu", campaign.id);
    await client.campaigns.stop("launch/eu", campaign.id);

    expectTypeOf(launched).toEqualTypeOf<
      ApiResponse<CampaignOperationResponse>
    >();
    expectTypeOf(paused).toEqualTypeOf<
      ApiResponse<CampaignOperationResponse>
    >();
    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      {
        method: "POST",
        path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}/launch`,
        body: '{"scheduledAt":1724086800000}',
      },
      {
        method: "POST",
        path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}/pause`,
        body: "",
      },
      {
        method: "POST",
        path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}/resume`,
        body: "",
      },
      {
        method: "POST",
        path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}/stop`,
        body: "",
      },
    ]);
    expect(requests[0]?.headers["idempotency-key"]).toBe(
      "campaign-launch-august",
    );
    expect(launched.data.data.operationId).toBe(
      "018f0000-0000-7000-8000-000000000003",
    );
  });

  it("requeues failed and optionally skipped recipients directly", async () => {
    const { client, requests } = await campaignsServer();

    const requeued = await client.campaigns.requeue(
      "launch/eu",
      campaign.id,
      { includeSkippedError: true },
      { idempotencyKey: "campaign-requeue-august" },
    );

    expectTypeOf(requeued).toEqualTypeOf<
      ApiResponse<CampaignRequeueResponse>
    >();
    expect(requeued.data.data).toEqual({ requeued: 3 });
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}/requeue`,
      body: '{"includeSkippedError":true}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe(
      "campaign-requeue-august",
    );
  });
});
