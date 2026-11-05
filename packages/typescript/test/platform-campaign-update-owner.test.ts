import { afterEach, expect, it } from "vitest";
import {
  Client,
  PolymorfaConfigurationError,
  type UpdatePlatformCampaignRequest,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const projectId = "018f0000-0000-7000-8000-000000000001";
const campaignId = "018f0000-0000-7000-8000-000000000002";
const otherId = "018f0000-0000-7000-8000-000000000003";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

it.each(
  ["projectId", "id"].flatMap((field) =>
    [projectId, otherId, null, undefined, false, 0].map((value) => ({
      field,
      value,
    })),
  ),
)("rejects a present $field=$value before HTTP", async ({ field, value }) => {
  const server = await startTestServer(() => ({ body: '{"data":{}}' }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const result = await Promise.resolve()
    .then(() =>
      client.campaigns.update(campaignId, { [field]: value }, { projectId }),
    )
    .catch((error: unknown) => error);
  expect(result).toBeInstanceOf(PolymorfaConfigurationError);
  expect(result).toMatchObject({ field });
  expect(server.requests).toHaveLength(0);
});

it("preserves empty updates, open JSON and explicit request versions on the selected campaign", async () => {
  const server = await startTestServer(() => ({
    body: JSON.stringify({ data: { id: campaignId } }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const bodies: (UpdatePlatformCampaignRequest | undefined)[] = [
    undefined,
    {},
    { futureField: false, count: 0, reset: null },
    { templateId: null, variableMapping: null, trackedLinks: null },
  ];
  for (const body of bodies) {
    for (const apiVersion of [undefined, "2026-10-14"]) {
      await client.campaigns.update(
        campaignId,
        body,
        { projectId },
        {
          ...(apiVersion === undefined ? {} : { apiVersion }),
          headers: { "x-test-extension": "retained" },
          maxNetworkRetries: 0,
        },
      );
      const request = server.requests.at(-1)!;
      expect(request.method).toBe("PATCH");
      expect(request.path).toBe(
        `/platform/campaigns/${campaignId}?projectId=${projectId}`,
      );
      expect(request.body).toBe(body === undefined ? "" : JSON.stringify(body));
      expect(request.headers["polymorfa-version"]).toBe(
        apiVersion ?? "2026-09-22",
      );
      expect(request.headers["x-test-extension"]).toBe("retained");
    }
  }
  expect(server.requests).toHaveLength(8);
});

it("keeps owner and identity fields out of the public PATCH body type", () => {
  const invalidBodies = () => {
    // @ts-expect-error select the owning project in params
    const project: UpdatePlatformCampaignRequest = { projectId };
    // @ts-expect-error campaign identity belongs in the path
    const identity: UpdatePlatformCampaignRequest = { id: campaignId };
    // @ts-expect-error presence is invalid even when null
    const nullOwner: UpdatePlatformCampaignRequest = { projectId: null };
    // @ts-expect-error exact optional fields cannot be explicitly undefined
    const undefinedIdentity: UpdatePlatformCampaignRequest = { id: undefined };
    return [project, identity, nullOwner, undefinedIdentity];
  };
  expect(invalidBodies).toBeTypeOf("function");
});
