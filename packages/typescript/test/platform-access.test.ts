import * as publicApi from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  AuditLogsResource,
  MembersResource,
  Client,
  SecurityIncidentsResource,
  SessionBansResource,
  type ApiResponse,
  type AuditLog,
  type DataEnvelope,
  type ManagementOperation,
  type OrganizationMember,
  type SecurityIncident,
  type SessionBan,
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

async function platformAccessServer(): Promise<{
  client: Client;
  requests: RecordedRequest[];
}> {
  const server = await startTestServer(() => ({
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_platform_access",
    },
    body: '{"data":[]}',
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

describe("Client organization access and operations", () => {
  it("exports the complete resource and response contracts", () => {
    expectTypeOf<Client["members"]>().toEqualTypeOf<MembersResource>();
    expectTypeOf<Client["auditLogs"]>().toEqualTypeOf<AuditLogsResource>();
    expectTypeOf<Client["sessionBans"]>().toEqualTypeOf<SessionBansResource>();
    expectTypeOf<
      Client["securityIncidents"]
    >().toEqualTypeOf<SecurityIncidentsResource>();
    expectTypeOf<Client>().toHaveProperty("operations");

    expectTypeOf<OrganizationMember>().toHaveProperty("joinedAt");
    expectTypeOf<AuditLog>().toHaveProperty("metadata");
    expectTypeOf<SessionBan>().toHaveProperty("banExpiresAt");
    expectTypeOf<SecurityIncident>().toHaveProperty("acknowledgedAt");
    expectTypeOf<ManagementOperation>().toHaveProperty("capabilities");
  });

  it("has no organization-key or project-token management resources", async () => {
    const { client, requests } = await platformAccessServer();
    expect(publicApi).not.toHaveProperty("ApiKeysResource");
    expect(publicApi).not.toHaveProperty("ProjectTokensResource");
    expect(client).not.toHaveProperty("apiKeys");
    expect(client).not.toHaveProperty("projectTokens");
    expect(requests).toHaveLength(0);
  });

  it("lists members but excludes dashboard-only invitations and mutations", async () => {
    const { client, requests } = await platformAccessServer();
    const listed = await client.members.list();

    expectTypeOf(listed).toEqualTypeOf<
      ApiResponse<DataEnvelope<readonly OrganizationMember[]>>
    >();
    expect(client.members).not.toHaveProperty("invite");
    expect(client.members).not.toHaveProperty("updateRole");
    expect(client.members).not.toHaveProperty("delete");
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/members",
    ]);
  });

  it("maps live audit filters without claiming cursor pagination", async () => {
    const { client, requests } = await platformAccessServer();
    const listed = await client.auditLogs.list(
      { action: "session.stop", resource: "session/a", limit: 250 },
      { apiVersion: "next" },
    );

    expectTypeOf(listed).toEqualTypeOf<
      ApiResponse<DataEnvelope<readonly AuditLog[]>>
    >();
    expect(requests[0]).toMatchObject({
      method: "GET",
      path: "/platform/audit?action=session.stop&resource=session%2Fa&limit=250",
    });
    expect(requests[0]?.headers["polymorfa-version"]).toBe("next");
  });

  it("lists all and active-only session bans", async () => {
    const { client, requests } = await platformAccessServer();
    const all = await client.sessionBans.list();
    const active = await client.sessionBans.listActive();

    expectTypeOf(all).toEqualTypeOf<
      ApiResponse<DataEnvelope<readonly SessionBan[]>>
    >();
    expectTypeOf(active).toEqualTypeOf<
      ApiResponse<DataEnvelope<readonly SessionBan[]>>
    >();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/bans",
      "GET /platform/bans/active",
    ]);
  });

  it("lists and acknowledges organization security incidents", async () => {
    const { client, requests } = await platformAccessServer();
    const listed = await client.securityIncidents.list();
    const acknowledged = await client.securityIncidents.acknowledge(
      "incident/a",
      { idempotencyKey: "ack-incident-a" },
    );

    expectTypeOf(listed).toEqualTypeOf<
      ApiResponse<DataEnvelope<readonly SecurityIncident[]>>
    >();
    expectTypeOf(acknowledged.data.data).toEqualTypeOf<{
      readonly acknowledged: true;
    }>();
    expect(
      requests.map(({ method, path, body }) => ({ method, path, body })),
    ).toEqual([
      { method: "GET", path: "/platform/incidents", body: "" },
      {
        method: "POST",
        path: "/platform/incidents/incident%2Fa/acknowledge",
        body: "",
      },
    ]);
    expect(requests[1]?.headers["idempotency-key"]).toBe("ack-incident-a");
  });
});
