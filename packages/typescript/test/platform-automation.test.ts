import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, it } from "vitest";

import { Client } from "../src/client.js";
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

  it("updates reminder settings with an idempotency key", async () => {
    const { client, requests } = await platformServer();

    await client.billing.updateReminderSettings(
      {
        lowBalanceThresholdCents: 2_500,
        reminderChannels: ["email", "inApp"],
      },
      { idempotencyKey: "billing-reminders-1" },
    );

    expect(requests[0]).toMatchObject({
      method: "PATCH",
      path: "/platform/billing/reminders",
      body: '{"lowBalanceThresholdCents":2500,"reminderChannels":["email","inApp"]}',
    });
    expect(requests[0]?.headers["idempotency-key"]).toBe("billing-reminders-1");
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
    await client.campaigns.retrieve("campaign/a");
    await client.campaigns.update("campaign/a", { name: "September" });
    await client.campaigns.delete("campaign/a");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/campaigns?projectId=project%2Fa&projectSlug=support",
      "POST /platform/campaigns",
      "GET /platform/campaigns/campaign%2Fa",
      "PATCH /platform/campaigns/campaign%2Fa",
      "DELETE /platform/campaigns/campaign%2Fa",
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
    await client.campaigns.stop("campaign/a", { reason: "stop" });
    await client.campaigns.archive("campaign/a", { reason: "archive" });
    await client.campaigns.duplicate("campaign/a", { reason: "duplicate" });
    await client.campaigns.requeue("campaign/a", { reason: "requeue" });
    await client.campaigns.analytics("campaign/a");
    await client.campaigns.events("campaign/a");
    await client.campaigns.recipients("campaign/a");

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /platform/campaigns/campaign%2Fa/launch",
      "POST /platform/campaigns/campaign%2Fa/pause",
      "POST /platform/campaigns/campaign%2Fa/resume",
      "POST /platform/campaigns/campaign%2Fa/stop",
      "POST /platform/campaigns/campaign%2Fa/archive",
      "POST /platform/campaigns/campaign%2Fa/duplicate",
      "POST /platform/campaigns/campaign%2Fa/requeue",
      "GET /platform/campaigns/campaign%2Fa/analytics",
      "GET /platform/campaigns/campaign%2Fa/events",
      "GET /platform/campaigns/campaign%2Fa/recipients",
    ]);
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
});
