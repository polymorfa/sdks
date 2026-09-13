import { afterEach, expect, it } from "vitest";
import { Client } from "../src/client.js";
import {
  PolymorfaConflictError,
  PolymorfaPaymentRequiredError,
  PolymorfaValidationError,
} from "../src/errors.js";
import type { SessionTierOverrideRequest } from "../src/platform/types.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { startTestServer, type TestServer } from "./support/http-server.js";

const servers: TestServer[] = [];
afterEach(async () => {
  await Promise.all(servers.splice(0).map((s) => s.close()));
});
function client(server: TestServer) {
  servers.push(server);
  return new Client({
    credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
    baseUrl: server.url,
    maxNetworkRetries: 0,
  });
}
const quote = {
  id: "01994234-0000-7000-8000-000000000001",
  status: "quoted",
  failureReason: null,
  expiresAtMs: 1800000600000,
  quote: {
    tier: "pro",
    tierOverride: "pro",
    amountCents: 25.2,
    priceVersion: "catalog-1",
    action: "upgrade",
    effectiveAtMs: 1800000000000,
    replacesWindowId: null,
  },
};

it("reviews, explicitly confirms, and reads the durable tier result without rounding fractional credits", async () => {
  const server = await startTestServer((_, index) => ({
    body: JSON.stringify({
      data: {
        ...quote,
        status: ["quoted", "queued", "applied"][index],
      },
    }),
  }));
  const sdk = client(server);
  const reviewed = await sdk.sessions.quoteTierChange("number/a", {
    tierOverride: "pro",
  });
  expect(reviewed.data.data.quote.amountCents).toBe(25.2);
  expect(server.requests).toHaveLength(1);
  const queued = await sdk.sessions.setTierOverride(
    "number/a",
    { quoteId: reviewed.data.data.id },
    { idempotencyKey: "confirm-1" },
  );
  expect(queued.data.data.status).toBe("queued");
  const applied = await sdk.sessions.retrieveTierChange("number/a", quote.id);
  expect(applied.data.data.status).toBe("applied");
  expect(server.requests.map((r) => `${r.method} ${r.path}`)).toEqual([
    "POST /platform/sessions/number%2Fa/tier-quotes",
    "PATCH /platform/sessions/number%2Fa",
    `GET /platform/sessions/number%2Fa/tier-quotes/${quote.id}`,
  ]);
  expect(server.requests[1]?.body).toBe(JSON.stringify({ quoteId: quote.id }));
  expect(server.requests[1]?.headers["idempotency-key"]).toBe("confirm-1");
});

it("rejects the old unquoted JavaScript call before making a request", async () => {
  const server = await startTestServer(() => ({ body: "{}" }));
  const sdk = client(server);
  expect(() =>
    sdk.sessions.setTierOverride("number", {
      tierOverride: "pro",
    } as unknown as SessionTierOverrideRequest),
  ).toThrow(PolymorfaValidationError);
  expect(server.requests).toHaveLength(0);
});

it("preserves quote expiry conflicts without creating or confirming a replacement purchase", async () => {
  const server = await startTestServer(() => ({
    status: 409,
    body: JSON.stringify({
      error: { code: "conflict", message: "Tier quote expired" },
    }),
  }));
  const sdk = client(server);
  await expect(
    sdk.sessions.setTierOverride("number", { quoteId: quote.id }),
  ).rejects.toBeInstanceOf(PolymorfaConflictError);
  expect(server.requests).toHaveLength(1);
});

it("preserves credit quantities through the public billing response", async () => {
  const server = await startTestServer(() => ({
    body: '{"data":{"balanceCents":17.500001,"preferredCurrency":"USD"}}',
  }));
  expect((await client(server).billing.retrieve()).data.data.balanceCents).toBe(
    17.500001,
  );
});

it("exposes insufficient funding as a payment-required error without retrying a start", async () => {
  const server = await startTestServer(() => ({
    status: 402,
    headers: {
      "content-type": "application/json",
      "x-request-id": "req_funding",
    },
    body: '{"code":"billing_credit_required","error":"Credit is unavailable for this number. Review team billing."}',
  }));
  await expect(client(server).sessions.start("number")).rejects.toMatchObject({
    name: PolymorfaPaymentRequiredError.name,
    status: 402,
    code: "billing_credit_required",
    requestId: "req_funding",
  });
  expect(server.requests).toHaveLength(1);
});
