import { afterEach, describe, expect, it } from "vitest";
import { MessagingClient } from "../src/index.js";
import { PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";
const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});
describe("Official API marketing status", () => {
  it("returns Meta's raw WABA status strings from the exact Graph route", async () => {
    const payload = {
      id: "102290129340398",
      marketing_messages_lite_api_status: "ELIGIBLE",
    };
    const server = await startTestServer(() => ({
      body: JSON.stringify(payload),
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
      baseUrl: server.url,
    });
    const status = await client.cloudMarketing.status("102290129340398", {
      version: "v26.0",
    });
    expect(status.data).toEqual(payload);
    expect(server.requests[0]!.method).toBe("GET");
    expect(server.requests[0]!.path).toBe(
      "/graph/whatsapp/v26.0/102290129340398/marketing_messages/status",
    );
  });
  it("rejects client tokens and blank identifiers before dispatch", () => {
    const browser = new MessagingClient({
      credential: { type: "clientToken", value: `pmfa_ct_${"A".repeat(94)}` },
    });
    expect(() =>
      browser.cloudMarketing.status("123", { version: "v26.0" }),
    ).toThrow("organization API key or project token");
    const server = new MessagingClient({
      credential: { type: "projectToken", value: PROJECT_TOKEN },
    });
    expect(() =>
      server.cloudMarketing.status(" ", { version: "v26.0" }),
    ).toThrow("WABA ID");
  });
});
