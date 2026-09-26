import { afterEach, describe, expect, it, vi } from "vitest";
import {
  Client,
  type UpdateStopConfirmationSettingsRequest,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import {
  startTestServer,
  type TestServer,
  type TestResponse,
} from "./support/http-server.js";

const teamId = "019d0000-0000-7000-8000-000000000002";
const settings = {
  teamId,
  enabled: false,
  locale: null,
  revision: 0,
  textRevision: 1,
  acknowledgement: null,
  updatedAt: null,
};
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
async function setup(response?: TestResponse) {
  const server = await startTestServer(
    (request) =>
      response ?? {
        headers: {
          "content-type": "application/json",
          "x-request-id": "stop-fixture",
        },
        body: JSON.stringify({
          data: request.path.endsWith("summary")
            ? {
                enabled: false,
                counts: {
                  queued: 0,
                  admitted: 0,
                  completed: 1,
                  failed: 2,
                  unknown: 3,
                },
              }
            : settings,
        }),
      },
  );
  servers.push(server);
  return {
    server,
    client: new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    }),
  };
}

describe("STOP confirmation contract", () => {
  it("preserves the organization preference, revision, locale and outcome envelope", async () => {
    const { client, server } = await setup();
    const read = await client.optOuts.getConfirmationSettings();
    expect(read.data.data).toEqual(settings);
    expect(read.metadata.requestId).toBe("stop-fixture");
    await client.optOuts.updateConfirmationSettings({
      teamId,
      enabled: true,
      locale: "pt-BR",
      revision: 0,
    });
    const summary = await client.optOuts.getConfirmationSummary();
    expect(summary.data.data.counts.unknown).toBe(3);
    expect(
      server.requests.map((request) => [request.method, request.path]),
    ).toEqual([
      ["GET", "/platform/optouts/confirmation-settings"],
      ["PUT", "/platform/optouts/confirmation-settings"],
      ["GET", "/platform/optouts/confirmation-summary"],
    ]);
    expect(JSON.parse(server.requests[1]!.body)).toEqual({
      teamId,
      enabled: true,
      locale: "pt-BR",
      revision: 0,
    });
    expect(server.requests[1]!.headers.authorization).toBe(
      `Bearer ${ORGANIZATION_API_KEY}`,
    );
  });
  it.each([
    { locale: null },
    { locale: "fr" },
    { revision: -1 },
    { revision: 2147483647 },
    { enabled: "true" },
    { teamId: "wrong" },
    { text: "arbitrary" },
  ])("rejects invalid input %j before HTTP", async (invalid) => {
    const { client, server } = await setup();
    expect(() =>
      client.optOuts.updateConfirmationSettings({
        teamId,
        enabled: true,
        locale: "en",
        revision: 0,
        ...invalid,
      } as UpdateStopConfirmationSettingsRequest),
    ).toThrow();
    expect(server.requests).toHaveLength(0);
  });
  it("allows an explicit disabled preference without selecting a language", async () => {
    const { client, server } = await setup();
    await client.optOuts.updateConfirmationSettings({
      teamId,
      enabled: false,
      locale: null,
      revision: 0,
    });
    expect(JSON.parse(server.requests[0]!.body)).toEqual({
      teamId,
      enabled: false,
      locale: null,
      revision: 0,
    });
  });
  it.each([403, 409, 503])(
    "preserves %i and never automatically retries a settings write",
    async (status) => {
      const { client, server } = await setup({
        status,
        body: JSON.stringify({
          error: {
            code: status === 409 ? "state_conflict" : "feature_unavailable",
            message: "unavailable",
          },
        }),
      });
      await expect(
        client.optOuts.updateConfirmationSettings(
          { teamId, enabled: false, locale: null, revision: 0 },
          { maxNetworkRetries: 3 },
        ),
      ).rejects.toMatchObject({ status });
      expect(server.requests).toHaveLength(1);
    },
  );
  it("does not retry an ambiguous transport loss even if the caller requests retries", async () => {
    const fetch = vi.fn(async () => {
      throw new TypeError("socket closed");
    });
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      fetch,
    });
    await expect(
      client.optOuts.updateConfirmationSettings(
        { teamId, enabled: false, locale: null, revision: 0 },
        { maxNetworkRetries: 3 },
      ),
    ).rejects.toThrow();
    expect(fetch).toHaveBeenCalledTimes(1);
  });
});
