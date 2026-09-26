import { afterEach, describe, expect, it } from "vitest";
import { MessagingClient } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function client(server: TestServer) {
  return new MessagingClient({
    credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
    maxNetworkRetries: 2,
  });
}

describe("Cloud templates", () => {
  it("preserves receipt fields and encodes Number, template name and language separately", async () => {
    const template = {
      id: "tpl_1",
      tenantId: "org_1",
      session: "support/eu",
      wabaId: "12345678901234567890",
      name: "delivery/name",
      language: "pt_BR",
      category: "UTILITY",
      status: "IN_APPEAL",
      components: [{ type: "BODY", text: "Your delivery is ready" }],
      metaTemplateId: "98765432109876543210",
      rejectionReason: "FORMAT",
      qualityScore: "GREEN",
      createdAt: "2026-09-26T00:00:00Z",
      updatedAt: "2026-09-26T00:00:00Z",
    };
    const server = await startTestServer(() => ({
      body: JSON.stringify({ success: true, data: template }),
    }));
    servers.push(server);
    const resource = client(server).cloudTemplates;
    expect(
      (
        await resource.retrieve("support/eu", "delivery/name", {
          language: "pt_BR",
        })
      ).data.data,
    ).toEqual(template);
    await resource.retrieve("support/eu", "delivery/name");
    await resource.list("support/eu");
    const body = {
      name: "delivery",
      language: "pt_BR",
      category: "UTILITY" as const,
      components: template.components,
    };
    await resource.create("support/eu", body);
    await resource.delete("support/eu", "delivery/name");
    expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
      "GET /messaging/support%2Feu/templates/delivery%2Fname?language=pt_BR",
      "GET /messaging/support%2Feu/templates/delivery%2Fname",
      "GET /messaging/support%2Feu/templates",
      "POST /messaging/support%2Feu/templates",
      "DELETE /messaging/support%2Feu/templates/delivery%2Fname",
    ]);
    expect(JSON.parse(server.requests[3]!.body)).toEqual(body);
    expect(server.requests[0]!.headers.authorization).toBe(
      `Bearer ${ORGANIZATION_API_KEY}`,
    );
  });

  it.each(["create", "delete"] as const)(
    "does not replay an uncertain %s, even with a key and retry override",
    async (method) => {
      const server = await startTestServer(() => ({
        status: 502,
        body: JSON.stringify({
          error: {
            code: "upstream_failure",
            message: "Meta outcome is unknown",
          },
        }),
      }));
      servers.push(server);
      const resource = client(server).cloudTemplates;
      const options = { idempotencyKey: "customer-key", maxNetworkRetries: 3 };
      const request =
        method === "create"
          ? resource.create(
              "support",
              {
                name: "delivery",
                language: "en_US",
                category: "UTILITY",
                components: [{}],
              },
              options,
            )
          : resource.delete("support", "delivery", options);
      await expect(request).rejects.toMatchObject({ status: 502 });
      expect(server.requests).toHaveLength(1);
    },
  );

  it("returns a catalog failure instead of an empty successful list", async () => {
    const server = await startTestServer(() => ({
      status: 502,
      body: JSON.stringify({
        error: { code: "upstream_failure", message: "Catalog unavailable" },
      }),
    }));
    servers.push(server);
    await expect(
      client(server).cloudTemplates.list("support", { maxNetworkRetries: 0 }),
    ).rejects.toMatchObject({ status: 502 });
  });
});
