import { afterEach, describe, expect, expectTypeOf, it } from "vitest";
import {
  MessagingClient,
  type MessageAckPayload,
  type MetaPricingReport,
} from "../src/index.js";
import { ORGANIZATION_API_KEY, PROJECT_TOKEN } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((server) => server.close()));
});

function client(
  server: TestServer,
  credential: "apiKey" | "projectToken" | "clientToken" = "apiKey",
) {
  return new MessagingClient({
    credential: {
      type: credential,
      value:
        credential === "apiKey"
          ? ORGANIZATION_API_KEY
          : credential === "projectToken"
            ? PROJECT_TOKEN
            : `pmfa_ct_${"A".repeat(94)}`,
    },
    baseUrl: server.url,
    maxNetworkRetries: 2,
  });
}

describe("Official API operations", () => {
  it.each(["apiKey", "projectToken"] as const)(
    "preserves unknown observations and uses Messaging routes with %s",
    async (credential) => {
      const state = {
        state: "unknown",
        reason: "notifications_interrupted",
        openedAt: null,
        expiresAt: null,
        checkedAt: "2026-09-26T00:00:00Z",
      };
      const pricing = {
        source: "meta",
        since: "2026-09-01T00:00:00Z",
        until: "2026-09-26T00:00:00Z",
        messages: 1,
        groups: [
          {
            category: "utility",
            pricingModel: "PMP",
            pricingType: null,
            billable: null,
            messages: 1,
          },
        ],
      };
      const health = {
        status: "unknown",
        checkedAt: null,
        nextCheckAt: null,
        token: { status: "unknown", expiresAt: null },
        missingPermissions: [],
        phoneRegistration: "unknown",
        webhookSubscription: "unknown",
        failureCode: "meta_unavailable",
      };
      const link = {
        quicklinkId: "ql_123",
        url: "https://pair.example/secret-link",
        session: "support/eu",
      };
      const data = [state, pricing, health, link];
      let index = 0;
      const server = await startTestServer(() => ({
        body: JSON.stringify({ success: true, data: data[index++] }),
      }));
      servers.push(server);
      const sdk = client(server, credential);
      expect(
        (await sdk.chats.getServiceWindow("support/eu", "+5511999999999")).data
          .data,
      ).toEqual(state);
      expect(
        (
          await sdk.sessions.getMetaPricing("support/eu", {
            since: pricing.since,
            until: pricing.until,
          })
        ).data.data,
      ).toEqual(pricing);
      expect(
        (await sdk.sessions.getCloudCredentialHealth("support/eu")).data.data,
      ).toEqual(health);
      expect(
        (await sdk.sessions.reauthorizeCloudCredentials("support/eu")).data
          .data,
      ).toEqual(link);
      expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
        "GET /messaging/support%2Feu/chats/%2B5511999999999/service-window",
        "GET /messaging/support%2Feu/meta-pricing?since=2026-09-01T00%3A00%3A00Z&until=2026-09-26T00%3A00%3A00Z",
        "GET /messaging/support%2Feu/cloud-credentials",
        "POST /messaging/support%2Feu/cloud-credentials/reauthorize",
      ]);
    },
  );

  it("rejects client tokens before disclosing any request", async () => {
    const server = await startTestServer(() => ({ body: "{}" }));
    servers.push(server);
    const sdk = client(server, "clientToken");
    for (const request of [
      () => sdk.chats.getServiceWindow("support", "+5511999999999"),
      () => sdk.sessions.getMetaPricing("support"),
      () => sdk.sessions.getCloudCredentialHealth("support"),
      () => sdk.sessions.reauthorizeCloudCredentials("support"),
    ])
      expect(request).toThrow();
    expect(server.requests).toHaveLength(0);
  });

  it("does not replay link creation with an idempotency key or retry override", async () => {
    const server = await startTestServer(() => ({
      status: 502,
      body: JSON.stringify({
        error: { code: "upstream_failure", message: "Outcome unknown" },
      }),
    }));
    servers.push(server);
    await expect(
      client(server).sessions.reauthorizeCloudCredentials("support", {
        idempotencyKey: "same-key",
        maxNetworkRetries: 4,
      }),
    ).rejects.toMatchObject({ status: 502 });
    expect(server.requests).toHaveLength(1);
  });

  it.each([403, 409, 503])(
    "preserves %s errors without synthesizing health or window state",
    async (status) => {
      const server = await startTestServer(() => ({
        status,
        body: JSON.stringify({
          error: { code: "feature_unavailable", message: "Unavailable" },
        }),
      }));
      servers.push(server);
      await expect(
        client(server).chats.getServiceWindow("support", "+5511999999999", {
          maxNetworkRetries: 0,
        }),
      ).rejects.toMatchObject({ status });
    },
  );

  it("types provider pricing as optional classification rather than a charge", () => {
    expectTypeOf<MessageAckPayload["pricing"]>().toEqualTypeOf<
      MetaPricingReport | undefined
    >();
    const report: MetaPricingReport = {
      category: "utility",
      pricing_model: "PMP",
      type: "free_customer_service",
      billable: false,
    };
    expect(report.billable).toBe(false);
  });
});
