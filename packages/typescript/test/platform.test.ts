import { afterEach, describe, expect, it } from "vitest";

import { PolymorfaConfigurationError } from "../src/errors.js";
import { PlatformClient } from "../src/platform/client.js";
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
  client: PlatformClient;
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
    client: new PlatformClient({
      apiKey: "pmfa_platform",
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("PlatformClient credentials", () => {
  it("rejects client and project tokens before issuing a request", () => {
    expect(() => new PlatformClient({ apiKey: "pmfa_ct_browser" })).toThrow(
      PolymorfaConfigurationError,
    );
    expect(() => new PlatformClient({ apiKey: "pmfa_pt_project" })).toThrow(
      PolymorfaConfigurationError,
    );
  });
});

describe("PlatformClient organizations and projects", () => {
  it("retrieves and updates the active organization", async () => {
    const { client, requests } = await platformServer();
    await client.organizations.retrieve();
    await client.organizations.update({
      name: "Support Team",
      timezone: "Asia/Beirut",
    });
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/organization",
      "PATCH /v1/organization",
    ]);
    expect(requests[1]?.body).toBe(
      '{"name":"Support Team","timezone":"Asia/Beirut"}',
    );
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
      "GET /v1/projects",
      "POST /v1/projects",
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
      "/v1/projects/project%2Fa/promote",
      "/v1/projects/project%2Fa/production-enrollments/operation%2Fb/approve",
      "/v1/projects/project%2Fa/production-enrollments/operation%2Fb/cancel",
    ]);
    expect(requests[0]?.body).toBe(JSON.stringify({ business }));
  });
});

describe("PlatformClient sessions", () => {
  it("lists sessions with optional project scope", async () => {
    const { client, requests } = await platformServer();
    await client.sessions.list();
    await client.sessions.list({ projectId: "project_1" });
    expect(requests.map(({ path }) => path)).toEqual([
      "/v1/sessions",
      "/v1/sessions?projectId=project_1",
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
      "POST /v1/sessions/session%2Fa/stop",
      "DELETE /v1/sessions/session%2Fa",
      "PATCH /v1/sessions/session%2Fa",
      "POST /v1/sessions/testing",
    ]);
    expect(requests[0]?.body).toBe('{"projectId":"project_1"}');
    expect(requests[2]?.body).toBe(
      '{"projectId":"project_1","tierOverride":"pro"}',
    );
  });
});
