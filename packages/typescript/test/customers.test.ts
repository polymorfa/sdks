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

async function customersServer(): Promise<{
  client: Client;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer((request) => {
    if (request.path.startsWith("/platform/customers?")) {
      return {
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          data: [{ id: "customer_1", name: "Ada" }],
          page: { nextCursor: "customer_2", hasMore: true },
        }),
      };
    }
    return {
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_customers",
      },
      body: '{"data":{"id":"fixture"}}',
    };
  });
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

describe("Client customers", () => {
  it("maps enablement, collection, and profile operations", async () => {
    const { client, requests } = await customersServer();

    await client.customers.status("project/a");
    await client.customers.enable("project/a", {
      idempotencyKey: "enable-1",
    });
    const listed = await client.customers.list({
      projectId: "project/a",
      cursor: "cursor/a",
      limit: 20,
      search: "Ada Lovelace",
      status: "active",
      isDefault: false,
      hasNumbers: true,
      needsAttention: false,
    });
    await client.customers.create(
      {
        projectId: "project/a",
        name: "Ada",
        externalCustomerId: "crm/a",
      },
      { idempotencyKey: "create-1" },
    );
    await client.customers.retrieve("customer/a", "project/a");
    await client.customers.update("customer/a", {
      projectId: "project/a",
      name: null,
    });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/projects/project%2Fa/customers/status",
      "POST /platform/projects/project%2Fa/customers/enable",
      "GET /platform/customers?projectId=project%2Fa&cursor=cursor%2Fa&limit=20&search=Ada+Lovelace&status=active&isDefault=false&hasNumbers=true&needsAttention=false",
      "POST /platform/customers",
      "GET /platform/customers/customer%2Fa?projectId=project%2Fa",
      "PATCH /platform/customers/customer%2Fa",
    ]);
    expect(requests[1]?.headers["idempotency-key"]).toBe("enable-1");
    expect(requests[3]?.headers["idempotency-key"]).toBe("create-1");
    expect(requests[3]?.body).toBe(
      '{"projectId":"project/a","name":"Ada","externalCustomerId":"crm/a"}',
    );
    expect(requests[5]?.body).toBe('{"projectId":"project/a","name":null}');
    expect(listed.data.page).toEqual({
      nextCursor: "customer_2",
      hasMore: true,
    });
  });

  it("maps lifecycle, Number, event, and pairing-link operations", async () => {
    const { client, requests } = await customersServer();

    await client.customers.archive(
      "customer/a",
      { projectId: "project/a" },
      { idempotencyKey: "archive-1" },
    );
    await client.customers.restore(
      "customer/a",
      { projectId: "project/a" },
      { idempotencyKey: "restore-1" },
    );
    await client.customers.listNumbers("customer/a", "project/a");
    await client.customers.listEvents("customer/a", {
      projectId: "project/a",
      limit: 25,
    });
    await client.customers.createPairingLink(
      "customer/a",
      {
        projectId: "project/a",
        expectedPhone: "+15551234567",
        methods: ["qr", "phone"],
        expiresInSeconds: 3600,
      },
      { idempotencyKey: "link-1" },
    );
    await client.customers.listPairingLinks("customer/a", "project/a");
    await client.customers.revokePairingLink(
      "customer/a",
      "link/a",
      "project/a",
    );
    await client.customers.transferNumber(
      "customer/a",
      "session/a",
      {
        projectId: "project/a",
        sourceCustomerId: "customer/source",
        confirm: true,
      },
      { idempotencyKey: "transfer-1" },
    );

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /platform/customers/customer%2Fa/archive",
      "POST /platform/customers/customer%2Fa/restore",
      "GET /platform/customers/customer%2Fa/numbers?projectId=project%2Fa",
      "GET /platform/customers/customer%2Fa/events?projectId=project%2Fa&limit=25",
      "POST /platform/customers/customer%2Fa/pairing-links",
      "GET /platform/customers/customer%2Fa/pairing-links?projectId=project%2Fa",
      "DELETE /platform/customers/customer%2Fa/pairing-links/link%2Fa?projectId=project%2Fa",
      "POST /platform/customers/customer%2Fa/numbers/session%2Fa/transfer",
    ]);
    expect(requests[0]?.headers["idempotency-key"]).toBe("archive-1");
    expect(requests[1]?.headers["idempotency-key"]).toBe("restore-1");
    expect(requests[4]?.headers["idempotency-key"]).toBe("link-1");
    expect(requests[7]?.headers["idempotency-key"]).toBe("transfer-1");
  });
});
