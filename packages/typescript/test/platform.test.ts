import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
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
        type: "organizationApiKey",
        value: ORGANIZATION_API_KEY,
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
          credential: { type: "organizationApiKey", value: "pmfa_ct_browser" },
        }),
    ).toThrow(PolymorfaConfigurationError);
    expect(
      () =>
        new Client({
          credential: {
            type: "organizationApiKey",
            value: PROJECT_TOKEN,
          },
        }),
    ).toThrow(PolymorfaConfigurationError);
  });
});

describe("Client organizations and projects", () => {
  it("retrieves the active organization without exposing dashboard-only updates", async () => {
    const { client, requests } = await platformServer();
    await client.organizations.retrieve();
    expect(client.organizations).not.toHaveProperty("update");
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

describe("Client sessions", () => {
  it("lists sessions with optional project scope", async () => {
    const { client, requests } = await platformServer();
    await client.sessions.list();
    await client.sessions.list({ projectId: "project_1" });
    expect(requests.map(({ path }) => path)).toEqual([
      "/platform/sessions",
      "/platform/sessions?projectId=project_1",
    ]);
  });

  it("maps stop, delete, tier override, and testing-session operations", async () => {
    const { client, requests } = await platformServer();
    await client.sessions.stop("session/a", { projectId: "project_1" });
    await client.sessions.delete("session/a");
    await client.sessions.setTierOverride("session/a", {
      projectId: "project_1",
      tierOverride: "pro",
    });
    await client.sessions.createTesting({
      projectId: "project_1",
      name: "Demo",
      country: "US",
    });

    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "POST /platform/sessions/session%2Fa/stop",
      "DELETE /platform/sessions/session%2Fa",
      "PATCH /platform/sessions/session%2Fa",
      "POST /platform/sessions/testing",
    ]);
    expect(requests[0]?.body).toBe('{"projectId":"project_1"}');
    expect(requests[2]?.body).toBe(
      '{"projectId":"project_1","tierOverride":"pro"}',
    );
  });
});
