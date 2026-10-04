import { readFileSync } from "node:fs";
import { afterEach, expect, expectTypeOf, it } from "vitest";
import {
  Client,
  PolymorfaConflictError,
  type CreatePlatformCampaignRequest,
  type ReschedulePlatformCampaignRequest,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

const body = {
  name: "August launch",
  projectId: "018f0000-0000-7000-8000-000000000001",
  templateId: "018f0000-0000-7000-8000-000000000002",
  recipientListId: "018f0000-0000-7000-8000-000000000003",
  senderConfig: {
    retry: { enabled: true },
    nested: [null, { enabled: false }],
  },
  scheduledAt: 1_800_000_000_000,
  sendWindow: {
    timeZone: "America/Sao_Paulo",
    days: ["monday", "friday"],
    hours: [{ start: "09:00", end: "18:00" }],
    recipientTimeZone: true,
    timeZoneVariable: "timeZone",
  },
  recipients: [{ phone: "+15551234567", variables: { plan: "pro" } }],
  recipientCount: 100,
  composerBlueprint: { steps: [null, { text: "Hello" }] },
  messagesArray: [{ kind: "text", text: "Hello" }],
  audienceRef: null,
  complianceConfig: false,
  variants: ["a", "b"],
  variantStrategy: "round_robin",
} satisfies CreatePlatformCampaignRequest;

it("covers exactly the pinned create request fields without closing opaque JSON", () => {
  const spec = JSON.parse(
    readFileSync(
      new URL("../../../contracts/openapi.platform.json", import.meta.url),
      "utf8",
    ),
  );
  const schema = spec.components.schemas.CreatePlatformCampaignRequest;
  const request = spec.paths["/platform/campaigns"].post.requestBody;
  expect(request.required).toBe(true);
  expect(request.content["application/json"].schema.$ref).toBe(
    "#/components/schemas/CreatePlatformCampaignRequest",
  );
  expect(schema.required).toEqual(["name"]);
  expect(schema.additionalProperties).toBe(false);
  expect(Object.keys(body).sort()).toEqual(
    Object.keys(schema.properties).sort(),
  );
  for (const field of [
    "composerBlueprint",
    "messagesArray",
    "audienceRef",
    "complianceConfig",
    "variants",
    "variantStrategy",
  ]) {
    expect(schema.properties[field]).toEqual({});
  }
  expectTypeOf<
    CreatePlatformCampaignRequest["composerBlueprint"]
  >().toEqualTypeOf<unknown>();
});

it("requires the organization project and body at compile time", () => {
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
  });
  const invalidCalls = () => {
    // @ts-expect-error create requires a body
    client.campaigns.create();
    // @ts-expect-error name is mandatory
    client.campaigns.create({ projectId: "project" });
    // @ts-expect-error organization clients require their owning project
    client.campaigns.create({ name: "August" });
    client.campaigns.create({
      name: "August",
      projectId: "project",
      // @ts-expect-error top-level fields are closed by the contract
      unknownField: true,
    });
    client.campaigns.create({
      name: "August",
      projectId: "project",
      // @ts-expect-error senderConfig is an object, unlike the opaque JSON fields
      senderConfig: false,
    });
    // @ts-expect-error the Platform create route has no replay contract
    client.campaigns.create(body, { idempotencyKey: "not-supported" });
    // @ts-expect-error the Platform create route must not be retried
    client.campaigns.create(body, { maxNetworkRetries: 2 });
  };
  expect(invalidCalls).toBeTypeOf("function");
});

it("sends the required scope and preserves every JSON field to the Platform route", async () => {
  const server = await startTestServer(() => ({
    status: 201,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data: { id: "campaign-1", name: body.name, recipientCount: 1 },
    }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const result = await client.campaigns.create(body);
  expect(server.requests).toHaveLength(1);
  expect(server.requests[0]).toMatchObject({
    method: "POST",
    path: "/platform/campaigns",
  });
  expect(JSON.parse(server.requests[0]!.body)).toEqual(body);
  expect(server.requests[0]!.headers["idempotency-key"]).toBeUndefined();
  expect(result.data.data).toEqual({
    id: "campaign-1",
    name: body.name,
    recipientCount: 1,
  });
});

it("never retries a Platform create after an uncertain server response", async () => {
  const server = await startTestServer(() => ({
    status: 503,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      error: { code: "temporarily_unavailable", message: "Try later" },
    }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
    maxNetworkRetries: 3,
  });
  await expect(client.campaigns.create(body)).rejects.toThrow();
  expect(server.requests).toHaveLength(1);
});

it("returns the archive receipt and surfaces an active-campaign conflict", async () => {
  const server = await startTestServer((_request, index) =>
    index === 0
      ? {
          status: 200,
          body: JSON.stringify({
            data: { status: "archived", campaignId: "campaign-1" },
          }),
        }
      : {
          status: 409,
          body: JSON.stringify({
            error: {
              code: "state_conflict",
              message: "Campaign is still running",
            },
          }),
        },
  );
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const receipt = await client.campaigns.archive("campaign-1");
  expect(receipt.data.data).toMatchObject({ status: "archived" });
  await expect(client.campaigns.archive("campaign-2")).rejects.toBeInstanceOf(
    PolymorfaConflictError,
  );
  expect(server.requests.map(({ method, path }) => [method, path])).toEqual([
    ["POST", "/platform/campaigns/campaign-1/archive"],
    ["POST", "/platform/campaigns/campaign-2/archive"],
  ]);
});

it("reschedules a waiting campaign with its project and safe retry key", async () => {
  const server = await startTestServer(() => ({
    status: 200,
    body: JSON.stringify({
      data: { id: "campaign-1", status: "running", operationId: "operation-1" },
    }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  const request: ReschedulePlatformCampaignRequest = {
    projectId: body.projectId,
    scheduledAt: null,
  };
  const result = await client.campaigns.reschedule("campaign-1", request, {
    idempotencyKey: "reschedule-campaign-1",
  });
  expect(server.requests[0]).toMatchObject({
    method: "POST",
    path: "/platform/campaigns/campaign-1/reschedule",
    body: JSON.stringify(request),
  });
  expect(server.requests[0]?.headers["idempotency-key"]).toBe(
    "reschedule-campaign-1",
  );
  expect(result.data.data).toMatchObject({ operationId: "operation-1" });
});
