import { afterEach, expect, it } from "vitest";
import {
  Client,
  PolymorfaValidationError,
  PolymorfaConflictError,
} from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
const id = "11111111-1111-4111-8111-111111111111",
  other = "22222222-2222-4222-8222-222222222222";
let server: TestServer;
afterEach(async () => {
  await server?.close();
});
it("serializes limits and single/reordered project and number priorities using revision guards", async () => {
  server = await startTestServer(() => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data: { revision: 1, projects: [], customers: [], numbers: [] },
    }),
  }));
  const client = new Client({
    baseUrl: server.url,
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    maxNetworkRetries: 0,
  });
  await client.billing.getLimits({ projectId: id });
  await client.billing.setLimit("number", id, {
    limitCredits: null,
    expectedRevision: 0,
  });
  await client.billing.getPriorities();
  await client.billing.setPriority("number", id, {
    priority: 12,
    expectedRevision: 1,
  });
  await client.billing.reorderPriorities({
    scope: "project",
    resourceIds: [other, id],
    expectedRevision: 2,
  });
  await client.billing.reorderPriorities({
    scope: "number",
    projectId: other,
    resourceIds: [id],
    expectedRevision: 3,
  });
  expect(server.requests.map((r) => [r.method, r.path])).toEqual([
    ["GET", `/platform/billing/limits?projectId=${id}`],
    ["PUT", `/platform/billing/limits/number/${id}`],
    ["GET", "/platform/billing/priorities"],
    ["PUT", `/platform/billing/priorities/number/${id}`],
    ["PUT", "/platform/billing/priorities"],
    ["PUT", "/platform/billing/priorities"],
  ]);
  expect(JSON.parse(server.requests[4]!.body)).toEqual({
    scope: "project",
    resourceIds: [other, id],
    expectedRevision: 2,
  });
  expect(JSON.parse(server.requests[5]!.body)).toEqual({
    scope: "number",
    projectId: other,
    resourceIds: [id],
    expectedRevision: 3,
  });
  expect(() =>
    client.billing.setLimit("project", id, {
      limitCredits: -1,
      expectedRevision: 0,
    }),
  ).toThrow(PolymorfaValidationError);
  expect(() =>
    client.billing.reorderPriorities({
      scope: "project",
      resourceIds: [id, id],
      expectedRevision: 0,
    }),
  ).toThrow(PolymorfaValidationError);
  expect(() =>
    client.billing.setPriority("number", id, {
      priority: 1,
      expectedRevision: -1,
    }),
  ).toThrow(PolymorfaValidationError);
  expect(server.requests).toHaveLength(6);
});
it("preserves a stale revision conflict without retrying or rewriting the request", async () => {
  server = await startTestServer(() => ({
    status: 409,
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      success: false,
      error: { code: "conflict", message: "priority changed; reload" },
    }),
  }));
  const client = new Client({
    baseUrl: server.url,
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    maxNetworkRetries: 0,
  });
  await expect(
    client.billing.setPriority("project", id, {
      priority: 4,
      expectedRevision: 0,
    }),
  ).rejects.toBeInstanceOf(PolymorfaConflictError);
  expect(server.requests).toHaveLength(1);
});

it("serializes singleton customer controls with both revisions and validates before transport", async () => {
  server = await startTestServer(() => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data: {
        budget: {
          scope: "customer",
          resourceId: id,
          projectId: other,
          name: "Acme",
          limitCredits: 200,
          spentCredits: 0,
          reservedCredits: 0,
          revision: 2,
        },
        priority: 40,
        priorityRevision: 3,
      },
    }),
  }));
  const client = new Client({
    baseUrl: server.url,
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    maxNetworkRetries: 0,
  });
  await client.billing.getResourceControls("customer", id);
  const input = {
    limitCredits: 200,
    priority: 40,
    expectedBudgetRevision: 1,
    expectedPriorityRevision: 2,
  };
  await client.billing.setResourceControls("customer", id, input);
  expect(server.requests.map((r) => [r.method, r.path])).toEqual([
    ["GET", `/platform/billing/controls/customer/${id}`],
    ["PUT", `/platform/billing/controls/customer/${id}`],
  ]);
  expect(JSON.parse(server.requests[1]!.body)).toEqual(input);
  expect(() =>
    client.billing.setResourceControls("customer", id, {
      ...input,
      priority: -1,
    }),
  ).toThrow(PolymorfaValidationError);
  expect(server.requests).toHaveLength(2);
});

it("filters project directories without loading customer and number lists", async () => {
  server = await startTestServer(() => ({
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      data: { revision: 1, projects: [], customers: [], numbers: [] },
    }),
  }));
  const client = new Client({
    baseUrl: server.url,
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    maxNetworkRetries: 0,
  });
  await client.billing.getLimits({ projectId: id, scope: "project" });
  await client.billing.getPriorities({ scope: "project" });
  expect(server.requests.map((r) => r.path)).toEqual([
    `/platform/billing/limits?projectId=${id}&scope=project`,
    "/platform/billing/priorities?scope=project",
  ]);
});
