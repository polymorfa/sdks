import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  Client,
  PolymorfaAuthorizationError,
  type ApiResponse,
  type DataEnvelope,
  type SessionCapabilities,
  type SessionCapability,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

async function client(status: number, body: unknown) {
  const server = await startTestServer(() => ({
    status,
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  }));
  servers.push(server);
  return {
    client: new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    }),
    requests: server.requests,
  };
}

describe("Client.sessions.getCapabilities", () => {
  it("reads a number's capabilities and narrows values by kind", async () => {
    const data = {
      session: "support",
      projectId: "11111111-2222-4333-8444-555555555555",
      status: "synced",
      syncedAt: "2026-09-24T10:00:00.000Z",
      checkedAt: "2026-09-24T11:00:00.000Z",
      accountType: "personal",
      capabilities: [
        {
          key: "channels",
          kind: "feature",
          unit: null,
          value: true,
          source: "server",
        },
        {
          key: "polls.maxOptions",
          kind: "limit",
          unit: "count",
          value: 12,
          source: "client_default",
        },
      ],
    };
    const { client: platform, requests } = await client(200, { data });
    const response = await platform.sessions.getCapabilities("support/a");
    expectTypeOf(response).toEqualTypeOf<
      ApiResponse<DataEnvelope<SessionCapabilities>>
    >();
    expect(requests.map(({ method, path }) => `${method} ${path}`)).toEqual([
      "GET /platform/sessions/support%2Fa/capabilities",
    ]);
    expect(response.data.data).toEqual(data);
    const limits = response.data.data.capabilities.filter(
      (
        capability,
      ): capability is Extract<SessionCapability, { kind: "limit" }> =>
        capability.kind === "limit",
    );
    expectTypeOf(limits[0]!.value).toEqualTypeOf<number | null>();
    expect(limits[0]!.value).toBe(12);
  });

  it("returns unknown values as null before the first sync", async () => {
    const { client: platform } = await client(200, {
      data: {
        session: "support",
        projectId: "11111111-2222-4333-8444-555555555555",
        status: "unknown",
        syncedAt: null,
        checkedAt: null,
        accountType: null,
        capabilities: [
          {
            key: "metaAi",
            kind: "feature",
            unit: null,
            value: null,
            source: null,
          },
        ],
      },
    });
    const response = await platform.sessions.getCapabilities("support");
    expect(response.data.data.status).toBe("unknown");
    expect(response.data.data.capabilities[0]!.value).toBeNull();
  });

  it("surfaces the beta refusal as an authorization error", async () => {
    const { client: platform } = await client(403, {
      error: {
        code: "permission_denied",
        message: "This beta is not available to this team",
      },
    });
    await expect(
      platform.sessions.getCapabilities("support"),
    ).rejects.toBeInstanceOf(PolymorfaAuthorizationError);
  });
});
