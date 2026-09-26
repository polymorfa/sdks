import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, it } from "vitest";

import { Client } from "../src/client.js";
import type {
  CreateAudienceFromCampaignRequest,
  CreateAudienceRequest,
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
  client: Client;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_platform_automation",
    },
    body: '{"data":{"id":"fixture"}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new Client({
      credential: {
        type: "organizationApiKey",
        value: ORGANIZATION_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("Client billing", () => {
  it("maps the complete organization-key billing read surface", async () => {
    const { client, requests } = await platformServer();

    const billing = await client.billing.retrieve();
    await client.billing.usage();
    await client.billing.listTransactions();
    await client.billing.listPricing();

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/billing",
      "GET /platform/billing/usage",
      "GET /platform/billing/transactions",
      "GET /platform/billing/pricing",
    ]);
    expect(billing.metadata.requestId).toBe("req_platform_automation");
  });

  it("does not expose the retired reminder mutation", async () => {
    const { client, requests } = await platformServer();
    expect(client.billing).not.toHaveProperty("updateReminderSettings");
    expect(requests).toHaveLength(0);
  });
});

describe("Client media", () => {
  it("maps media URL, delete, and upload operations", async () => {
    const { client, requests } = await platformServer();
    const retrieved = await client.media.retrieve("media/a");
    await client.media.delete("media/a");
    await client.media.createUpload(
      { projectId: "project_1", contentType: "image/png" },
      { idempotencyKey: "upload-1" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/media/media%2Fa",
      "DELETE /platform/media/media%2Fa",
      "POST /platform/media/uploads",
    ]);
    expect(requests[2]?.body).toBe(
      '{"projectId":"project_1","contentType":"image/png"}',
    );
    expect(requests[2]?.headers["idempotency-key"]).toBe("upload-1");
    expect(retrieved.metadata.requestId).toBe("req_platform_automation");
  });
});

describe("Client opt-outs", () => {
  it("maps list, single, batch, and encoded delete operations", async () => {
    const { client, requests } = await platformServer();
    await client.optOuts.list();
    await client.optOuts.create(
      { phone: "+1 555" },
      { idempotencyKey: "opt-out-1" },
    );
    await client.optOuts.createBatch({ phones: ["+1 555", "+44 20"] });
    await client.optOuts.delete("+1/555");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/optouts",
      "POST /platform/optouts",
      "POST /platform/optouts/batch",
      "DELETE /platform/optouts/%2B1%2F555",
    ]);
    expect(requests[1]?.body).toBe('{"phone":"+1 555"}');
    expect(requests[1]?.headers["idempotency-key"]).toBe("opt-out-1");
    expect(requests[2]?.body).toBe('{"phones":["+1 555","+44 20"]}');
  });

  it("reads and replaces the organization keyword settings", async () => {
    const { client, requests } = await platformServer();
    await client.optOuts.getSettings();
    await client.optOuts.updateSettings({
      enabled: true,
      optOutKeywords: ["STOP", "BAJA"],
      optInKeywords: ["START"],
    });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/optouts/settings",
      "PUT /platform/optouts/settings",
    ]);
    expect(requests[1]?.body).toBe(
      '{"enabled":true,"optOutKeywords":["STOP","BAJA"],"optInKeywords":["START"]}',
    );
  });
});

describe("Client audiences", () => {
  it("maps collection, encoded item, and upload operations", async () => {
    const { client, requests } = await platformServer();
    await client.audiences.list();
    await client.audiences.create(
      { name: "August" },
      { idempotencyKey: "audience-1" },
    );
    await client.audiences.retrieve("list/a");
    await client.audiences.delete("list/a");
    await client.audiences.createUpload({ filename: "audience.csv" });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/audiences",
      "POST /platform/audiences",
      "GET /platform/audiences/list%2Fa",
      "DELETE /platform/audiences/list%2Fa",
      "POST /platform/audiences/uploads",
    ]);
    expect(requests[1]?.body).toBe('{"name":"August"}');
    expect(requests[1]?.headers["idempotency-key"]).toBe("audience-1");
    expect(requests[4]?.body).toBe('{"filename":"audience.csv"}');
  });

  it("imports a spreadsheet through fileId and mapping", async () => {
    const { client, requests } = await platformServer();
    await client.audiences.create({
      name: "August",
      source: "csv",
      fileId: "upload_1",
      mapping: { phone: "Phone", variables: { firstName: "First name" } },
    });

    expect(requests[0]?.body).toBe(
      '{"name":"August","source":"csv","fileId":"upload_1","mapping":{"phone":"Phone","variables":{"firstName":"First name"}}}',
    );
  });

  it("creates a campaign-outcome audience with exact organization route and body", async () => {
    const { client, requests } = await platformServer();
    const response = await client.audiences.createFromCampaign({
      name: "Read follow-up",
      campaignId: "campaign/1",
      projectId: "project/1",
      outcome: "read",
    });

    expect(response.metadata.requestId).toBe("req_platform_automation");
    expect(requests[0]).toMatchObject({
      method: "POST",
      path: "/platform/audiences/from-campaign",
      body: '{"name":"Read follow-up","campaignId":"campaign/1","projectId":"project/1","outcome":"read"}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBeUndefined();
    const invalid: CreateAudienceFromCampaignRequest = {
      name: "x",
      campaignId: "x",
      // @ts-expect-error the API accepts only its seven named outcomes
      outcome: "clicked",
    };
    expect(invalid.outcome).toBe("clicked");
  });

  it("types audience creation as members or a mapped file, never both", async () => {
    const { client, requests } = await platformServer();
    await client.audiences.create({ name: "Empty" });

    // @ts-expect-error a file import requires a mapping
    const unmapped: CreateAudienceRequest = { name: "A", fileId: "upload_1" };
    // @ts-expect-error members and fileId are mutually exclusive
    const both: CreateAudienceRequest = {
      name: "A",
      members: [{ phone: "+1 555" }],
      fileId: "upload_1",
      mapping: { phone: "Phone" },
    };
    // @ts-expect-error a mapping belongs to a file import
    const stray: CreateAudienceRequest = { name: "A", mapping: { phone: "P" } };

    expect([unmapped, both, stray]).toHaveLength(3);
    expect(requests[0]?.body).toBe('{"name":"Empty"}');
  });

  it("appends, pages, and removes members on the encoded member routes", async () => {
    const { client, requests } = await platformServer();
    await client.audiences.addMembers(
      "list/a",
      { members: [{ phone: "+1 555", variables: { plan: "pro" } }] },
      { idempotencyKey: "members-1" },
    );
    await client.audiences.listMembers("list/a", {
      cursor: "cur/1",
      limit: 50,
    });
    await client.audiences.listMembers("list/a");
    await client.audiences.deleteMember("list/a", "+1/555");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /platform/audiences/list%2Fa/members",
      "GET /platform/audiences/list%2Fa/members?cursor=cur%2F1&limit=50",
      "GET /platform/audiences/list%2Fa/members",
      "DELETE /platform/audiences/list%2Fa/members/%2B1%2F555",
    ]);
    expect(requests[0]?.body).toBe(
      '{"members":[{"phone":"+1 555","variables":{"plan":"pro"}}]}',
    );
    expect(requests[0]?.headers["idempotency-key"]).toBe("members-1");
  });
});

describe("Client campaigns", () => {
  it("maps collection, encoded item, and project query operations", async () => {
    const { client, requests } = await platformServer();
    await client.campaigns.list({
      projectId: "project/a",
      projectSlug: "support",
    });
    await client.campaigns.create(
      { projectId: "project/a", name: "August" },
      { idempotencyKey: "campaign-1" },
    );
    await client.campaigns.retrieve("campaign/a", { projectId: "project/a" });
    await client.campaigns.update(
      "campaign/a",
      { name: "September" },
      { projectId: "project/a" },
    );
    await client.campaigns.delete("campaign/a", { projectId: "project/a" });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/campaigns?projectId=project%2Fa&projectSlug=support",
      "POST /platform/campaigns",
      "GET /platform/campaigns/campaign%2Fa?projectId=project%2Fa",
      "PATCH /platform/campaigns/campaign%2Fa?projectId=project%2Fa",
      "DELETE /platform/campaigns/campaign%2Fa?projectId=project%2Fa",
    ]);
    expect(requests[1]?.body).toBe('{"projectId":"project/a","name":"August"}');
    expect(requests[1]?.headers["idempotency-key"]).toBe("campaign-1");
    expect(requests[3]?.body).toBe('{"name":"September"}');
  });

  it("maps lifecycle actions and read subresources", async () => {
    const { client, requests } = await platformServer();
    await client.campaigns.launch("campaign/a", { reason: "launch" });
    await client.campaigns.pause("campaign/a", { reason: "pause" });
    await client.campaigns.resume("campaign/a", { reason: "resume" });
    await client.campaigns.stop(
      "campaign/a",
      { reason: "stop" },
      { idempotencyKey: "platform-campaign-stop" },
    );
    await client.campaigns.archive("campaign/a", { reason: "archive" });
    await client.campaigns.duplicate("campaign/a", { reason: "duplicate" });
    await client.campaigns.requeue("campaign/a", { reason: "requeue" });
    await client.campaigns.analytics("campaign/a", { projectId: "project/a" });
    await client.campaigns.events("campaign/a", { projectId: "project/a" });
    await client.campaigns.recipients("campaign/a", { projectId: "project/a" });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /platform/campaigns/campaign%2Fa/launch",
      "POST /platform/campaigns/campaign%2Fa/pause",
      "POST /platform/campaigns/campaign%2Fa/resume",
      "POST /platform/campaigns/campaign%2Fa/stop",
      "POST /platform/campaigns/campaign%2Fa/archive",
      "POST /platform/campaigns/campaign%2Fa/duplicate",
      "POST /platform/campaigns/campaign%2Fa/requeue",
      "GET /platform/campaigns/campaign%2Fa/analytics?projectId=project%2Fa",
      "GET /platform/campaigns/campaign%2Fa/events?projectId=project%2Fa",
      "GET /platform/campaigns/campaign%2Fa/recipients?projectId=project%2Fa",
    ]);
    for (const request of requests.slice(0, 3)) {
      expect(request.headers["idempotency-key"]).toMatch(/^[0-9a-f-]{36}$/);
    }
    expect(requests[3]?.headers["idempotency-key"]).toBe(
      "platform-campaign-stop",
    );
    for (const request of requests.slice(4, 7)) {
      expect(request.headers["idempotency-key"]).toBeUndefined();
    }
    expect(requests.slice(0, 7).map(({ body }) => body)).toEqual([
      '{"reason":"launch"}',
      '{"reason":"pause"}',
      '{"reason":"resume"}',
      '{"reason":"stop"}',
      '{"reason":"archive"}',
      '{"reason":"duplicate"}',
      '{"reason":"requeue"}',
    ]);
  });

  it("points an unlaunched draft at another audience, or detaches it", async () => {
    const { client, requests } = await platformServer();
    await client.campaigns.update(
      "campaign/a",
      { recipientListId: "list/b" },
      { projectId: "project/a" },
    );
    await client.campaigns.update(
      "campaign/a",
      { recipientListId: null },
      { projectId: "project/a" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "PATCH /platform/campaigns/campaign%2Fa?projectId=project%2Fa",
      "PATCH /platform/campaigns/campaign%2Fa?projectId=project%2Fa",
    ]);
    expect(requests.map(({ body }) => body)).toEqual([
      '{"recipientListId":"list/b"}',
      '{"recipientListId":null}',
    ]);
  });

  it("keeps the update body open beyond the named field", async () => {
    const { client, requests } = await platformServer();
    await client.campaigns.update(
      "campaign/a",
      {
        name: "September",
        recipientListId: "list/b",
      },
      { projectId: "project/a" },
    );

    expect(requests[0]?.body).toBe(
      '{"name":"September","recipientListId":"list/b"}',
    );
  });

  it("pages recipients and filters them by status", async () => {
    const { client, requests } = await platformServer();
    await client.campaigns.recipients("campaign/a", {
      projectId: "project/a",
      status: "skipped",
      cursor: "cur/1",
      limit: 100,
    });
    await client.campaigns.addRecipients(
      "campaign/a",
      { projectId: "project/a", recipients: [{ phone: "+1 555" }] },
      { idempotencyKey: "recipients-1" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/campaigns/campaign%2Fa/recipients?projectId=project%2Fa&status=skipped&cursor=cur%2F1&limit=100",
      "POST /platform/campaigns/campaign%2Fa/recipients",
    ]);
    expect(requests[1]?.body).toBe(
      '{"projectId":"project/a","recipients":[{"phone":"+1 555"}]}',
    );
    expect(requests[1]?.headers["idempotency-key"]).toBe("recipients-1");
  });
});

it("requires project scope on organization campaigns and omits campaigns from project views", async () => {
  const { client } = await platformServer();
  const project = client.project("project/a");
  expect(project).not.toHaveProperty("campaigns");
  // These calls are compile-time assertions and must never reach transport.
  const invalidCalls = () => {
    // @ts-expect-error project views do not expose Platform campaigns
    void project.campaigns;
    // @ts-expect-error an organization client must supply project parameters
    client.campaigns.retrieve("campaign/a");
    // @ts-expect-error a project ID is required within the parameters
    client.campaigns.retrieve("campaign/a", {});
    // @ts-expect-error updates require project parameters, even with an omitted body
    client.campaigns.update("campaign/a", undefined);
    // @ts-expect-error deletion requires project parameters
    client.campaigns.delete("campaign/a");
    // @ts-expect-error analytics requires project parameters
    client.campaigns.analytics("campaign/a");
    // @ts-expect-error events requires project parameters
    client.campaigns.events("campaign/a");
    // @ts-expect-error recipient listing requires project parameters
    client.campaigns.recipients("campaign/a");
    // @ts-expect-error a status filter alone does not scope the project
    client.campaigns.recipients("campaign/a", { status: "queued" });
    // @ts-expect-error recipient append requires its owning project
    client.campaigns.addRecipients("campaign/a", { recipients: [] });
  };
  expect(invalidCalls).toBeTypeOf("function");
});
