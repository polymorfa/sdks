import {
  Client,
  SystemClient,
  webhooks,
} from "../packages/typescript/dist/index.js";

/** Runs without Node globals or network access in an edge runtime. */
export async function runEdgeRuntimeSmoke() {
  const event = {
    id: "evt_edge",
    session: "test",
    timestamp: "2026-09-27T00:00:00Z",
    event: "future.ready",
    payload: { ok: true },
  };
  const fixture = await webhooks.createFixture({
    event,
    secret: "local-test-secret",
  });
  const verified = await webhooks.verify({
    body: fixture.body,
    signature: fixture.signature,
    secret: "local-test-secret",
  });
  if (JSON.stringify(verified) !== JSON.stringify(event)) {
    throw new Error("Webhook fixture did not round trip.");
  }
  if (
    await webhooks.verifySignature({
      body: fixture.body,
      signature: fixture.signature,
      secret: "wrong-secret",
    })
  ) {
    throw new Error("Webhook signature accepted the wrong secret.");
  }

  const system = new SystemClient({
    baseUrl: "https://example.invalid",
    maxNetworkRetries: 0,
    fetch: async (input, init) => {
      if (
        String(input) !== "https://example.invalid/messaging/info/status" ||
        init?.method !== "GET"
      ) {
        throw new Error("Unexpected request shape.");
      }
      return new Response(JSON.stringify({ status: "ok" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const response = await system.status();
  if (response.data.status !== "ok") {
    throw new Error("Fetch transport did not decode the response.");
  }

  const fakeKey = `pmfa_${"A".repeat(72)}`;
  const platform = new Client({
    credential: { type: "organizationApiKey", value: fakeKey },
    baseUrl: "https://example.invalid",
    maxNetworkRetries: 0,
    fetch: async (input, init) => {
      if (
        String(input) !== "https://example.invalid/platform/edge-smoke" ||
        new Headers(init?.headers).get("authorization") !== `Bearer ${fakeKey}`
      ) {
        throw new Error("Credentialed request shape changed.");
      }
      return new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    },
  });
  const platformResponse = await platform.raw.request({
    method: "GET",
    path: "/platform/edge-smoke",
  });
  if (platformResponse.data.ok !== true) {
    throw new Error("Credentialed fetch response did not decode.");
  }
  return "ok";
}
