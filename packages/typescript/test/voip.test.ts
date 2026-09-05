import { afterEach, describe, expect, expectTypeOf, it } from "vitest";

import {
  MessagingClient,
  VoipResource,
  type ApiResponse,
  type ClientRules,
  type SetClientRulesRequest,
  type VoipTokenResponse,
} from "../src/index.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];

afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

describe("VoipResource", () => {
  it("mints the browser call token on the server", async () => {
    const server = await startTestServer(() => ({
      status: 200,
      headers: {
        "content-type": "application/json",
        "x-request-id": "req_voip_token",
      },
      body: '{"success":true,"data":{"token":"pmfa_ct_browser","expiresAt":1757000000000}}',
    }));
    servers.push(server);
    const client = new MessagingClient({
      credential: { type: "apiKey", value: "pmfa_example" },
      baseUrl: server.url,
      maxNetworkRetries: 0,
    });
    expectTypeOf(client.voip).toEqualTypeOf<VoipResource>();

    const response = await client.voip.token({
      session: "support",
      ephemeralId: "browser-1",
      ttlSeconds: 600,
    });
    expectTypeOf(response).toEqualTypeOf<ApiResponse<VoipTokenResponse>>();
    expect(server.requests[0]).toMatchObject({
      method: "POST",
      path: "/api/voip/token",
    });
    expect(JSON.parse(server.requests[0]?.body ?? "{}")).toEqual({
      session: "support",
      ephemeralId: "browser-1",
      ttlSeconds: 600,
    });
    expect(response.data.data.token).toBe("pmfa_ct_browser");
    expect(response.metadata.requestId).toBe("req_voip_token");
  });

  it("types the client rules the runtime returns, including the calls bindings", () => {
    const rules: ClientRules = {
      recipientMode: "any",
      allowedActions: "voip_place,voip_answer,voip_signal,read_contact",
      rateLimit: 60,
      maxDaily: 0,
      allowedOrigins: "",
      maxConcurrency: 2,
      allowedNumber: "",
      enabled: true,
    };
    const update: SetClientRulesRequest = {
      recipientMode: "any",
      allowedActions: rules.allowedActions,
      maxConcurrency: 2,
      enabled: true,
    };
    expect(update.maxConcurrency).toBe(rules.maxConcurrency);
  });
});
