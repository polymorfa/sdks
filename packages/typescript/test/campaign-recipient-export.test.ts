import { afterEach, describe, expect, it } from "vitest";

import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { Client, MessagingClient } from "../src/index.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const csv =
  "recipientId,phone,status,failureReason\r\nr-1,'+14155550100,skipped,opted_out\r\n";

describe("campaign recipient CSV export", () => {
  it("paginates unfiltered Messaging CSV export", async () => {
    const server = await startTestServer((_request, index) => ({
      headers: {
        "content-type": "text/csv; charset=utf-8",
        ...(index === 0 ? { "polymorfa-next-cursor": "page/2" } : {}),
      },
      body: csv,
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });

    const first = await client.campaigns.exportRecipients(
      "shop/eu",
      "campaign/1",
      { limit: 20 },
    );
    const second = await client.campaigns.exportRecipients(
      "shop/eu",
      "campaign/1",
      { limit: 20, cursor: first.data.nextCursor! },
    );
    expect(first.data).toEqual({ csv, nextCursor: "page/2" });
    expect(second.data).toEqual({ csv, nextCursor: null });
    expect(server.requests.map((request) => request.path)).toEqual([
      "/messaging/projects/shop%2Feu/campaigns/campaign%2F1/recipients/export?limit=20",
      "/messaging/projects/shop%2Feu/campaigns/campaign%2F1/recipients/export?cursor=page%2F2&limit=20",
    ]);
    expect(server.requests[0]?.headers.accept).toBe("text/csv");
  });

  it("sends Platform project scope and rejects a success body with the wrong media type", async () => {
    const server = await startTestServer((_request, index) => ({
      headers: { "content-type": index === 0 ? "text/csv" : "text/html" },
      body: index === 0 ? csv : "<html>unexpected</html>",
    }));
    servers.push(server);
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    const first = await client.campaigns.exportRecipients("campaign/1", {
      projectId: "project/1",
      reason: "send_failed",
    });
    expect(first.data).toEqual({ csv, nextCursor: null });
    expect(server.requests[0]?.path).toBe(
      "/platform/campaigns/campaign%2F1/recipients/export?projectId=project%2F1&reason=send_failed",
    );
    await expect(
      client.campaigns.exportRecipients("campaign/1", {
        projectId: "project/1",
      }),
    ).rejects.toMatchObject({ code: "invalid_response" });
  });

  it("raises a JSON API error without returning it as CSV", async () => {
    const server = await startTestServer(() => ({
      status: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error: {
          type: "invalid_request_error",
          code: "invalid_parameter",
          message: "cursor is invalid",
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
      client.campaigns.exportRecipients("shop", "campaign", { cursor: "bad" }),
    ).rejects.toMatchObject({ status: 400 });
  });

  it("surfaces the filtered export size conflict without returning partial CSV", async () => {
    const server = await startTestServer(() => ({
      status: 409,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        error:
          "More than 1,000 recipients match this filter. Export all recipients, then filter the CSV.",
        docs: "https://docs.polymorfa.com/api/errors",
      }),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    });
    await expect(
      client.campaigns.exportRecipients("shop", "campaign", {
        status: "skipped",
      }),
    ).rejects.toMatchObject({ status: 409 });
    expect(server.requests).toHaveLength(1);
  });
});
