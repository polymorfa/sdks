import { afterEach, expect, it } from "vitest";
import { Client } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

it("sends only the allowed organization webhook test body", async () => {
  const server = await startTestServer(() => ({
    status: 200,
    body: JSON.stringify({ data: { operationId: "operation-1" } }),
  }));
  servers.push(server);
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
  });
  await client.webhooks.test("hook-1", { eventType: "polymorfa.test" });
  expect(server.requests[0]).toMatchObject({
    method: "POST",
    path: "/platform/webhooks/hook-1/tests",
    body: '{"eventType":"polymorfa.test"}',
  });
});

it("keeps project webhook test body authority separate", () => {
  const client = new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
  });
  const invalidOrganizationBody = () => {
    client.webhooks.test("hook-1", {
      // @ts-expect-error organization webhook tests reject supplied bodies
      body: { event: "x" },
      // @ts-expect-error organization webhook tests reject session IDs
      sessionId: "session-1",
    });
  };
  expect(invalidOrganizationBody).toBeTypeOf("function");
});
