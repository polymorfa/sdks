import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MessagingClient } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

const fixture = JSON.parse(
  readFileSync(
    new URL(
      "../../../contracts/fixtures/calls-coverage-end.candidate.json",
      import.meta.url,
    ),
    "utf8",
  ),
);
describe("call settings coverage end is response-only", () => {
  for (const value of fixture.cases)
    for (const method of ["GET", "PUT"]) {
      it(value.name + method, async () => {
        const settings = {
          ...fixture.settings,
          simultaneousCalls: value.on,
          simultaneousCallsCoverageExcludedUntil: value.until,
        };
        const client = new MessagingClient({
          credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
          baseUrl: "https://api.example",
          maxNetworkRetries: 0,
          fetch: async (input, init) => {
            expect(String(input)).toBe(
              "https://api.example/platform/sessions/support/call-settings",
            );
            expect(init?.method).toBe(method);
            if (method === "PUT")
              expect(JSON.parse(String(init?.body))).toEqual({
                callsEnabled: false,
              });
            return new Response(
              JSON.stringify({ success: true, data: settings }),
              { headers: { "content-type": "application/json" } },
            );
          },
        });
        const result =
          method === "GET"
            ? await client.voip.retrieveCallSettings("support")
            : await client.voip.updateCallSettings("support", {
                callsEnabled: false,
              });
        expect(result.data.data.simultaneousCallsCoverageExcludedUntil).toBe(
          value.until,
        );
        expect(result.data.data).toEqual(settings);
      });
    }
  it("preserves older-server absence without converting it to a coverage decision", async () => {
    const client = new MessagingClient({
      credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
      fetch: async () =>
        new Response(
          JSON.stringify({ success: true, data: fixture.settings }),
          { headers: { "content-type": "application/json" } },
        ),
    });
    const result = await client.voip.retrieveCallSettings("support");
    expect(
      Object.hasOwn(result.data.data, "simultaneousCallsCoverageExcludedUntil"),
    ).toBe(false);
  });
});
