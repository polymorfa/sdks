import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  ApiKeysResource,
  AuditLogsResource,
  MembersResource,
  Client,
  ProjectTokensResource,
  SecurityIncidentsResource,
  SessionBansResource,
  type ApiResponse,
  type ApiKey,
  type AuditLog,
  type DataEnvelope,
  type ManagementOperation,
  type OrganizationOperation,
  type OrganizationMember,
  type ProjectToken,
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
      credential: { type: "organizationApiKey", value: "pmfa_platform" },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
  };
}

describe("Client organization access and operations", () => {
  it("exports the complete resource and response contracts", () => {
    expectTypeOf<Client["apiKeys"]>().toEqualTypeOf<ApiKeysResource>();
    expectTypeOf<Client["members"]>().toEqualTypeOf<MembersResource>();
    expectTypeOf<Client["auditLogs"]>().toEqualTypeOf<AuditLogsResource>();
    expectTypeOf<Client["sessionBans"]>().toEqualTypeOf<SessionBansResource>();
    expectTypeOf<
      Client["securityIncidents"]
    >().toEqualTypeOf<SecurityIncidentsResource>();
    expectTypeOf<Client["operations"]>().toHaveProperty("list");
    expectTypeOf<
      Client["projectTokens"]
    >().toEqualTypeOf<ProjectTokensResource>();

    expectTypeOf<ApiKey>().toHaveProperty("lastUsed");
    expectTypeOf<OrganizationMember>().toHaveProperty("joinedAt");
    expectTypeOf<AuditLog>().toHaveProperty("metadata");
    expectTypeOf<SessionBan>().toHaveProperty("banExpiresAt");
    expectTypeOf<SecurityIncident>().toHaveProperty("acknowledgedAt");
    expectTypeOf<ManagementOperation>().toHaveProperty("capabilities");
    expectTypeOf<ProjectToken>().toHaveProperty("revokedAt");
  });

  it("lists and deactivates organization API keys without exposing key material", async () => {
    const { client, requests } = await platformAccessServer();
    const listed = await client.apiKeys.list();
    const deactivated = await client.apiKeys.deactivate("key/a", {
      idempotencyKey: "deactivate-key-a",
    });

    expectTypeOf(listed).toEqualTypeOf<
      ApiResponse<DataEnvelope<readonly ApiKey[]>>
    >();
    expectTypeOf(deactivated.data.data).toEqualTypeOf<{
      readonly ok: true;
      readonly keyId: string;
    }>();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/keys",
      "DELETE /v1/keys/key%2Fa",
    ]);
    expect(requests[1]?.headers["idempotency-key"]).toBe("deactivate-key-a");
    expect(listed.metadata.requestId).toBe("req_platform_access");
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
      "GET /v1/members",
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
      path: "/v1/audit?action=session.stop&resource=session%2Fa&limit=250",
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
      "GET /v1/bans",
      "GET /v1/bans/active",
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
      { method: "GET", path: "/v1/incidents", body: "" },
      {
        method: "POST",
        path: "/v1/incidents/incident%2Fa/acknowledge",
        body: "",
      },
    ]);
    expect(requests[1]?.headers["idempotency-key"]).toBe("ack-incident-a");
  });

  it("retrieves durable operation state and requires a project for token metadata", async () => {
    const { client, requests } = await platformAccessServer();
    const operation = await client.operations.retrieve("operation/a");
    const tokens = await client.projectTokens.list("project/a", {
      timeoutMs: 5_000,
    });

    expectTypeOf(operation).toEqualTypeOf<ApiResponse<OrganizationOperation>>();
    expectTypeOf(tokens).toEqualTypeOf<
      ApiResponse<DataEnvelope<readonly ProjectToken[]>>
    >();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /v1/operations/operation%2Fa",
      "GET /v1/tokens?projectId=project%2Fa",
    ]);
  });
});
