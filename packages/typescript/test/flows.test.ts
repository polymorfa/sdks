import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  Client,
  type FlowProviderResult,
  type CreateFlowRequest,
  type FlowProviderRequest,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
const projectId = "11111111-2222-4333-8444-555555555555";
function client(server: TestServer) {
  return new Client({
    credential: { type: "projectToken", value: PROJECT_TOKEN },
    projectId,
    baseUrl: server.url,
    maxNetworkRetries: 3,
  });
}

describe("project Flow lifecycle", () => {
  it("binds project identity on all draft and lifecycle paths", async () => {
    const server = await startTestServer(() => ({
      body: JSON.stringify({ data: null }),
    }));
    servers.push(server);
    const flows = client(server).flows;
    await flows.list();
    expect((await flows.retrieve("flow/eu")).data).toBeNull();
    await flows.create({ name: "Booking", definition: { version: "7.1" } });
    await flows.update("flow/eu", { expectedUpdatedAt: 42, name: "Booking 2" });
    await flows.delete("flow/eu");
    for (const method of [
      "upload",
      "publish",
      "deprecate",
      "discard",
      "sync",
    ] as const) {
      await flows[method]("flow/eu", {
        sessionId: "support",
        categories: ["APPOINTMENT_BOOKING"],
        requestId: "22222222-2222-4222-8222-222222222222",
      });
    }
    await flows.receipts("flow/eu");
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      `GET /platform/flows?projectId=${projectId}`,
      `GET /platform/flows/flow%2Feu?projectId=${projectId}`,
      "POST /platform/flows",
      "PATCH /platform/flows/flow%2Feu",
      `DELETE /platform/flows/flow%2Feu?projectId=${projectId}`,
      ...["upload", "publish", "deprecate", "discard", "sync"].map(
        (action) => `POST /platform/flows/flow%2Feu/${action}`,
      ),
      `GET /platform/flows/flow%2Feu/receipts?projectId=${projectId}`,
    ]);
    for (const request of server.requests.filter((r) =>
      ["POST", "PATCH"].includes(r.method),
    ))
      expect(JSON.parse(request.body)).toHaveProperty("projectId", projectId);
    expect(JSON.parse(server.requests[5]!.body)).toMatchObject({
      requestId: "22222222-2222-4222-8222-222222222222",
    });
  });
  it("exposes Flow authority only through a project and rejects input overrides", async () => {
    const server = await startTestServer(() => ({
      body: JSON.stringify({ data: null }),
    }));
    servers.push(server);
    const organization = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: server.url,
    });
    expect(Object.hasOwn(organization, "flows")).toBe(false);
    const flows = organization.project(projectId).flows;
    expect(() =>
      flows.create({
        projectId: "another",
        name: "Booking",
        definition: {},
      } as CreateFlowRequest),
    ).toThrow("override");
    expect(() =>
      flows.upload("flow", {
        flowId: "another",
        sessionId: "support",
      } as FlowProviderRequest),
    ).toThrow("override");
    expect(server.requests).toHaveLength(0);
  });
  it.each(["upload", "publish", "deprecate", "discard", "sync"] as const)(
    "does not repeat %s after an uncertain response",
    async (action) => {
      const server = await startTestServer(() => ({
        status: 503,
        body: JSON.stringify({
          error: { code: "service_unavailable", message: "Unknown outcome" },
        }),
      }));
      servers.push(server);
      await expect(
        client(server).flows[action](
          "flow",
          { sessionId: "support" },
          { idempotencyKey: "request", maxNetworkRetries: 4 },
        ),
      ).rejects.toMatchObject({ status: 503 });
      expect(server.requests).toHaveLength(1);
    },
  );
  it("preserves an uncertain receipt independently of a 200 response", async () => {
    const data = {
      operation: {
        state: "uncertain",
        flowName: "original_name",
        errorCode: "provider_outcome_unknown",
      },
      flow: { id: "flow" },
    };
    const server = await startTestServer(() => ({
      body: JSON.stringify({ data }),
    }));
    servers.push(server);
    const response = await client(server).flows.upload("flow", {
      sessionId: "support",
    });
    expectTypeOf(response.data).toEqualTypeOf<FlowProviderResult>();
    expect(response.data).toEqual(data);
    expectTypeOf(response.data.operation!.flowName).toEqualTypeOf<string>();
  });
});
