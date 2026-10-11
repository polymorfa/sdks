import { readFileSync } from "node:fs";
import { once } from "node:events";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { HttpTransport } from "../src/transport/http.js";
import { MessagingClient } from "../src/messaging/client.js";
import { webhooks } from "../src/webhooks/utilities.js";
import type { RawRequest } from "../src/transport/types.js";
// The server is a dependency-free, language-neutral wire fixture process.
// @ts-expect-error Plain JS fixture server has no public SDK declaration.
import { createFixtureServer } from "../../../scripts/sdk-fixture-server.mjs";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../contracts/fixtures/behavior.json", import.meta.url),
    "utf8",
  ),
);
const server = createFixtureServer(fixture);
let base: string;
beforeAll(async () => {
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  base = `http://127.0.0.1:${server.address().port}`;
});
afterAll(async () => {
  server.closeAllConnections();
  await new Promise<void>((done) => server.close(done));
});

describe("shared native wire behavior", () => {
  for (const scenario of fixture.scenarios) {
    it(scenario.id, async () => {
      const url = `${base}/__fixtures/${scenario.id}`;
      const transport = new HttpTransport({
        baseUrl: url,
        authorization: `Bearer ${fixture.organizationCredential}`,
        apiVersion: fixture.apiVersion,
        maxNetworkRetries: scenario.outcome.maxNetworkRetries ?? 2,
        timeoutMs: scenario.outcome.timeoutMs ?? 1000,
        sleep: async () => {},
      });
      const controller = new AbortController();
      const request: RawRequest = {
        method: scenario.request.method,
        path: scenario.request.path,
        headers: { "x-polymorfa-fixture": scenario.id },
        ...(scenario.request.query ? { query: scenario.request.query } : {}),
        ...(Object.hasOwn(scenario.request, "body")
          ? { body: scenario.request.body }
          : {}),
        ...(scenario.request.headers["idempotency-key"]
          ? { idempotencyKey: scenario.request.headers["idempotency-key"] }
          : {}),
        ...(scenario.id === "request-version"
          ? { apiVersion: "2026-10-01" }
          : {}),
        signal: controller.signal,
      };
      const timer = scenario.outcome.cancelAfterMs
        ? setTimeout(() => controller.abort(), scenario.outcome.cancelAfterMs)
        : undefined;
      try {
        const error = scenario.outcome.error;
        if (error) {
          const names: Record<string, string> = {
            validation: "PolymorfaValidationError",
            authentication: "PolymorfaAuthenticationError",
            payment_required: "PolymorfaPaymentRequiredError",
            authorization: "PolymorfaAuthorizationError",
            not_found: "PolymorfaNotFoundError",
            conflict: "PolymorfaConflictError",
            rate_limit: "PolymorfaRateLimitError",
            server: "PolymorfaServerError",
            timeout: "PolymorfaTimeoutError",
            cancelled: "PolymorfaCancelledError",
          };
          await expect(transport.request(request)).rejects.toMatchObject({
            name: names[error],
            ...(scenario.outcome.code
              ? {
                  code: scenario.outcome.code,
                  requestId: scenario.outcome.requestId,
                }
              : {}),
          });
        } else {
          const result = await transport.request(request);
          expect(result.metadata.attempts).toBe(scenario.outcome.attempts);
          expect(result.metadata.status).toBe(scenario.responses.at(-1).status);
          expect(result.data).toEqual(scenario.responses.at(-1).body);
        }
        const state = await (await fetch(`${url}/state`)).json();
        expect(state).toEqual({
          attempts: scenario.outcome.attempts,
          mismatches: [],
        });
      } finally {
        clearTimeout(timer);
      }
    });
  }
  it("invokes the public Messaging sessions and messages methods", async () => {
    for (const id of ["sessions-list", "message-send"]) {
      await fetch(`${base}/__fixtures/${id}/reset`, { method: "POST" });
      const client = new MessagingClient({
        baseUrl: `${base}/__fixtures/${id}`,
        credential: { type: "apiKey", value: fixture.organizationCredential },
      });
      const options = { headers: { "x-polymorfa-fixture": id } };
      const result =
        id === "sessions-list"
          ? await client.sessions.list(options)
          : await client.messages.send(
              "support",
              {
                conversation: { phoneNumber: "+15551234567" },
                content: { text: "Hello" },
              },
              { ...options, idempotencyKey: "send-fixture" },
            );
      expect(result.data).toEqual(
        fixture.scenarios.find((scenario: { id: string }) => scenario.id === id)
          .responses[0].body,
      );
      expect(
        await (await fetch(`${base}/__fixtures/${id}/state`)).json(),
      ).toEqual({ attempts: 1, mismatches: [] });
    }
  });
});

describe("shared raw-body signature vectors", () => {
  for (const vector of fixture.webhooks) {
    it(vector.id, async () => {
      const input = {
        body: vector.body,
        secret: vector.secret,
        signature: vector.signature,
        nowUnixSeconds: vector.nowUnixSeconds,
        toleranceSeconds: vector.toleranceSeconds,
      };
      if (vector.protocol === "native") {
        expect(await webhooks.verifySignature(input)).toBe(vector.valid);
        if (vector.valid)
          expect((await webhooks.verify(input)).event).toBe("future.ready");
      } else if (vector.valid)
        expect((await webhooks.verifyLocal(input)).event).toBe("future.ready");
      else await expect(webhooks.verifyLocal(input)).rejects.toThrow();
    });
  }
});
