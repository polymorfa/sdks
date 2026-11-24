import { TEAM_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { afterEach, describe, expect, it } from "vitest";

import { PolymorfaConfigurationError } from "../src/errors.js";
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
      "x-request-id": "req_platform",
    },
    body: '{"data":{}}',
  }));
  servers.push(server);
  return {
    requests: server.requests,
    client: new Client({
      credential: {
        type: "teamApiKey",
        value: TEAM_API_KEY,
      },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("Client credentials", () => {
  it("rejects client and project tokens before issuing a request", () => {
    expect(
      () =>
        new Client({
          credential: {
            type: "teamApiKey",
            value: "pmfa_ct_YnJvd3Nlcg",
          },
        }),
    ).toThrow(PolymorfaConfigurationError);
    expect(
      () =>
        new Client({
          credential: {
            type: "teamApiKey",
            value: PROJECT_TOKEN,
          },
        }),
    ).toThrow(PolymorfaConfigurationError);
  });
});

describe("Client teams and projects", () => {
  it("retrieves the active team without exposing dashboard-only updates", async () => {
    const { client, requests } = await platformServer();
    await client.teams.retrieve();
    expect(client.teams).not.toHaveProperty("update");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/team",
    ]);
  });

  it("lists and creates projects", async () => {
    const { client, requests } = await platformServer();
    await client.projects.list();
    const created = await client.projects.create(
      {
        name: "Support",
        icon: { type: "emoji", value: "💬" },
        defaultTier: "standard",
      },
      { idempotencyKey: "project-support" },
    );
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/projects",
      "POST /platform/projects",
    ]);
    expect(requests[1]?.headers["idempotency-key"]).toBe("project-support");
    expect(created.metadata.requestId).toBe("req_platform");
  });

  it("accepts only the documented create-project icon types", async () => {
    const { client } = await platformServer();
    await client.projects.create({
      name: "Typed icon",
      // @ts-expect-error the API accepts only emoji, icon, or image icons
      icon: { type: "invalid", value: "x" },
    });
  });

  it("maps production enrollment request, approval, and cancellation", async () => {
    const { client, requests } = await platformServer();
    const business = {
      name: "Support Team",
      website: "https://example.test",
      supportEmail: "support@example.test",
    };
    await client.projects.requestProductionEnrollment("project/a", {
      business,
    });
    await client.projects.approveProductionEnrollment(
      "project/a",
      "operation/b",
    );
    await client.projects.cancelProductionEnrollment(
      "project/a",
      "operation/b",
    );

    expect(requests.map(({ path }) => path)).toEqual([
      "/platform/projects/project%2Fa/promote",
      "/platform/projects/project%2Fa/production-enrollments/operation%2Fb/approve",
      "/platform/projects/project%2Fa/production-enrollments/operation%2Fb/cancel",
    ]);
    expect(requests[0]?.body).toBe(JSON.stringify({ business }));
  });
});

describe("Client connections", () => {
  it("lists connections with optional project scope", async () => {
    const { client, requests } = await platformServer();
    await client.connections.list();
    await client.connections.list({ projectId: "project_1" });
    expect(requests.map(({ path }) => path)).toEqual([
      "/platform/connections",
      "/platform/connections?projectId=project_1",
    ]);
  });

  it("maps stop, delete, tier override, and testing-connection operations", async () => {
    const { client, requests } = await platformServer();
    await client.connections.stop("connection/a", { projectId: "project_1" });
    await client.connections.delete("connection/a");
    await client.connections.setTierOverride("connection/a", {
      projectId: "project_1",
      quoteId: "quote_1",
    });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /platform/connections/connection%2Fa/stop",
      "DELETE /platform/connections/connection%2Fa",
      "PATCH /platform/connections/connection%2Fa",
    ]);
    expect(requests[0]?.body).toBe('{"projectId":"project_1"}');
    expect(requests[2]?.body).toBe(
      '{"projectId":"project_1","quoteId":"quote_1"}',
    );
  });
});

it("reads and updates unified connection configuration through Platform", async () => {
  const { client, requests } = await platformServer();
  const patch = {
    revision: 4,
    configuration: { reset: ["historySync.mode" as const] },
  };
  await client.connections.retrieve("support/eu");
  await client.connections.update("support/eu", patch);
  expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
    "GET /platform/connections/support%2Feu",
    "PUT /platform/connections/support%2Feu",
  ]);
  expect(JSON.parse(requests[1]!.body)).toEqual(patch);
});
