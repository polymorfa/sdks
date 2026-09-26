import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingCampaignsResource,
  MessagingClient,
  PolymorfaPaymentRequiredError,
  PolymorfaServerError,
  type AddCampaignRecipientsResponse,
  type ApiResponse,
  type Campaign,
  type CampaignAnalytics,
  type CampaignOperationResponse,
  type CampaignRecipient,
  type CampaignRequeueResponse,
  type CampaignStopResponse,
  type CampaignTestSendResponse,
  type CreateCampaignResponse,
  type GetCampaignResponse,
  type ListCampaignRecipientsResponse,
  type ListCampaignsResponse,
  type UpdateCampaignResponse,
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

const recipient = {
  id: "018f0000-0000-7000-8000-000000000004",
  phone: "+15551234567",
  variables: { firstName: "Ada" },
  variantKey: null,
  status: "skipped",
  attempts: 0,
  lastError: "opted_out",
  externalMessageId: null,
  queuedAt: 1_724_000_000_000,
  sentAt: null,
  deliveredAt: null,
  readAt: null,
  failedAt: null,
  respondedAt: null,
  messagesSent: 0,
  nextMessageAt: null,
  sequenceError: null,
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
    body: request.path.endsWith("/test-send")
      ? JSON.stringify({
          success: true,
          data: {
            id: "018f0000-0000-7000-8000-000000000005",
            campaignId: campaign.id,
            status: "sent",
            from: {
              sessionId: "018f0000-0000-7000-8000-000000000006",
              phone: "+15550100001",
            },
            to: "+15550100002",
            messageId: "wamid.test",
            variables: { firstName: "Ada" },
            createdAt: 1_724_000_000_000,
          },
        })
      : request.path.includes("/recipients")
        ? request.method === "GET"
          ? JSON.stringify({
              success: true,
              data: [recipient],
              page: { nextCursor: "cursor-2", hasMore: true },
            })
          : JSON.stringify({
              success: true,
              data: {
                campaignId: campaign.id,
                added: 2,
                recipientCount: 52,
                duplicateCount: 1,
                invalidCount: 1,
                invalidRows: [{ row: 4, reason: "invalid_phone" }],
              },
            })
        : request.path.endsWith("/analytics")
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
                    request.path.endsWith("/reschedule") ||
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
  it("surfaces campaign eligibility errors from the current contract", async () => {
    const server = await startTestServer((_request, index) => ({
      status: index === 0 ? 402 : 503,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: {
          code: index === 0 ? "campaigns_not_entitled" : "service_unavailable",
          message:
            index === 0
              ? "The selected number's plan does not include campaigns."
              : "The selected number's plan could not be checked.",
        },
      }),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });

    await expect(
      client.campaigns.launch("launch/eu", campaign.id),
    ).rejects.toMatchObject({
      constructor: PolymorfaPaymentRequiredError,
      status: 402,
      code: "campaigns_not_entitled",
    });
    await expect(
      client.campaigns.launch("launch/eu", campaign.id),
    ).rejects.toMatchObject({
      constructor: PolymorfaServerError,
      status: 503,
      code: "service_unavailable",
    });
    expect(server.requests).toHaveLength(2);
  });

  it("sends a draft test once with a stable idempotency key and typed receipt", async () => {
    const { client, requests } = await campaignsServer();
    const result = await client.campaigns.testSend(
      "launch/eu",
      campaign.id,
      {
        sessionId: "018f0000-0000-7000-8000-000000000006",
        to: "+15550100002",
        sampleRecipientId: "018f0000-0000-7000-8000-000000000004",
        variables: { firstName: "Ada" },
      },
      { idempotencyKey: "campaign-test-1" },
    );

    expectTypeOf(result).toEqualTypeOf<ApiResponse<CampaignTestSendResponse>>();
    expect(result.data.data.status).toBe("sent");
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}/test-send`,
      body: JSON.stringify({
        sessionId: "018f0000-0000-7000-8000-000000000006",
        to: "+15550100002",
        sampleRecipientId: "018f0000-0000-7000-8000-000000000004",
        variables: { firstName: "Ada" },
      }),
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("campaign-test-1");
  });
  it("exports the exact resource and live campaign contracts", () => {
    expectTypeOf<
      MessagingClient["campaigns"]
    >().toEqualTypeOf<MessagingCampaignsResource>();
    expectTypeOf<Campaign>().toHaveProperty("recipientCount");
    expectTypeOf<Campaign>().toHaveProperty("scheduledAt");
    expectTypeOf<CampaignRecipient>().toHaveProperty("messagesSent");
    expectTypeOf<CampaignRecipient>().toHaveProperty("nextMessageAt");
    expectTypeOf<CampaignRecipient>().toHaveProperty("sequenceError");
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
        variableMapping: { firstName: { source: "name", fallback: "friend" } },
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
        variableMapping: { firstName: { source: "name", fallback: "friend" } },
        recipientListId: "audience/a",
        senderConfig: { retry: { maxAttempts: 5 } },
        scheduledAt: 1_724_086_800_000,
      }),
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe(
      "campaign-create-august",
    );
  });

  it("updates a draft through the project-scoped PATCH route", async () => {
    const { client, requests } = await campaignsServer();
    const updated = await client.campaigns.update("launch/eu", campaign.id, {
      name: "Autumn launch",
      recipientListId: null,
      senderConfig: { sessionIds: ["session-1"] },
      scheduledAt: null,
    });

    expectTypeOf(updated).toEqualTypeOf<ApiResponse<UpdateCampaignResponse>>();
    expect(requests[0]).toMatchObject({
      method: "PATCH",
      path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}`,
      body: JSON.stringify({
        name: "Autumn launch",
        recipientListId: null,
        senderConfig: { sessionIds: ["session-1"] },
        scheduledAt: null,
      }),
    });
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
    await client.campaigns.stop("launch/eu", campaign.id, {
      idempotencyKey: "campaign-stop-august",
    });

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
    expect(requests[1]?.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests[2]?.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    expect(requests[3]?.headers["idempotency-key"]).toBe(
      "campaign-stop-august",
    );
    expect(launched.data.data.operationId).toBe(
      "018f0000-0000-7000-8000-000000000003",
    );
  });

  it("reschedules a waiting launch with the exact body and stable retry key", async () => {
    const { client, requests } = await campaignsServer();
    const response = await client.campaigns.reschedule(
      "launch/eu",
      campaign.id,
      { scheduledAt: null },
      { idempotencyKey: "start-now-august" },
    );

    expectTypeOf(response).toEqualTypeOf<
      ApiResponse<CampaignOperationResponse>
    >();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}/reschedule`,
      body: '{"scheduledAt":null}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("start-now-august");
    expect(response.data.data.operationId).toBe(
      "018f0000-0000-7000-8000-000000000003",
    );
  });

  it("returns a known reschedule conflict without replaying the write", async () => {
    const server = await startTestServer(() => ({
      status: 409,
      body: JSON.stringify({
        error: {
          code: "campaign_state_conflict",
          message: "Campaign already started.",
        },
      }),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 2,
    });

    await expect(
      client.campaigns.reschedule("launch/eu", campaign.id, {
        scheduledAt: null,
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(server.requests).toHaveLength(1);
  });

  it("sends an explicit skip policy for recipients missing variables", async () => {
    const { client, requests } = await campaignsServer();
    await client.campaigns.launch(
      "launch/eu",
      campaign.id,
      { skipMissingVariables: true },
      { idempotencyKey: "campaign-skip-missing" },
    );

    expect(requests[0]?.body).toBe('{"skipMissingVariables":true}');
    expect(requests[0]?.headers["idempotency-key"]).toBe(
      "campaign-skip-missing",
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

describe("MessagingClient campaign recipients", () => {
  it("pages recipients and filters them by status", async () => {
    const { client, requests } = await campaignsServer();

    const page = await client.campaigns.listRecipients(
      "launch/eu",
      campaign.id,
      { status: "skipped", cursor: "cursor-1", limit: 100 },
    );
    await client.campaigns.listRecipients("launch/eu", campaign.id);

    expectTypeOf(page).toEqualTypeOf<
      ApiResponse<ListCampaignRecipientsResponse>
    >();
    expectTypeOf(page.data.data[0]).toEqualTypeOf<
      CampaignRecipient | undefined
    >();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      `GET /messaging/projects/launch%2Feu/campaigns/${campaign.id}/recipients?status=skipped&cursor=cursor-1&limit=100`,
      `GET /messaging/projects/launch%2Feu/campaigns/${campaign.id}/recipients`,
    ]);
    expect(page.data.page).toEqual({ nextCursor: "cursor-2", hasMore: true });
    expect(page.data.data[0]?.lastError).toBe("opted_out");
  });

  it("reports duplicate and invalid entries when appending recipients", async () => {
    const { client, requests } = await campaignsServer();

    const added = await client.campaigns.addRecipients(
      "launch/eu",
      campaign.id,
      { recipients: [{ phone: "+15551234567", variables: { plan: "pro" } }] },
      { idempotencyKey: "recipients-august" },
    );

    expectTypeOf(added).toEqualTypeOf<
      ApiResponse<AddCampaignRecipientsResponse>
    >();
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: `/messaging/projects/launch%2Feu/campaigns/${campaign.id}/recipients`,
      body: '{"recipients":[{"phone":"+15551234567","variables":{"plan":"pro"}}]}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("recipients-august");
    expect(added.data.data).toMatchObject({
      added: 2,
      duplicateCount: 1,
      invalidCount: 1,
      invalidRows: [{ row: 4, reason: "invalid_phone" }],
    });
  });

  it("creates a draft with inline recipients", async () => {
    const { client, requests } = await campaignsServer();

    await client.campaigns.create("launch/eu", {
      name: "August launch",
      recipients: [{ phone: "+15551234567" }],
    });

    expect(requests[0]?.body).toBe(
      '{"name":"August launch","recipients":[{"phone":"+15551234567"}]}',
    );
  });

  it("types stop with a nullable operation ID", async () => {
    const { client, requests } = await campaignsServer();

    const stopped = await client.campaigns.stop("launch/eu", campaign.id);

    expectTypeOf(stopped).toEqualTypeOf<ApiResponse<CampaignStopResponse>>();
    expectTypeOf(stopped.data.data.operationId).toEqualTypeOf<string | null>();
    expect(requests[0]?.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
  });
});
