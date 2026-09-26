import { afterEach, describe, expect, it } from "vitest";
import { MessagingClient } from "../src/index.js";
import { PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
describe("Official API catalog discovery", () => {
  it("preserves opaque catalog IDs and cursors through the exact Graph route", async () => {
    const payload = {
      data: [{ id: "98765432109876543210", name: "Shop" }],
      paging: { cursors: { after: "cursor+/=" } },
    };
    const server = await startTestServer(() => ({
      body: JSON.stringify(payload),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      baseUrl: server.url,
    });
    expect(
      (
        await client.cloudCatalogs.list("12345678901234567890", {
          version: "v26.0",
          limit: 50,
          after: "cursor+/=",
        })
      ).data,
    ).toEqual(payload);
    expect(server.requests[0]!.path).toBe(
      "/graph/whatsapp/v26.0/12345678901234567890/product_catalogs?limit=50&after=cursor%2B%2F%3D",
    );
    expect(server.requests[0]!.headers.authorization).toBe(
      `Bearer ${PROJECT_TOKEN}`,
    );
  });
  it("preserves Meta permission errors without retrying forbidden reads", async () => {
    const server = await startTestServer(() => ({
      status: 403,
      body: JSON.stringify({
        error: {
          message: "Permission required",
          code: 200,
          type: "OAuthException",
        },
      }),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      baseUrl: server.url,
      maxNetworkRetries: 2,
    });
    await expect(
      client.cloudCatalogs.list("123", { version: "v26.0" }),
    ).rejects.toMatchObject({ status: 403 });
    expect(server.requests).toHaveLength(1);
  });
  it("rejects client credentials before dispatch", () => {
    const client = new MessagingClient({
      credential: { type: "clientToken", value: `pmfa_ct_${"A".repeat(94)}` },
    });
    expect(() =>
      client.cloudCatalogs.list("123", { version: "v26.0" }),
    ).toThrow("organization API key or project token");
  });
});
