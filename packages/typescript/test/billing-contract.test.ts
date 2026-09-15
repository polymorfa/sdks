import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps reviewed billing and session administration in the canonical Platform contract", () => {
  const spec = JSON.parse(
    readFileSync(
      new URL("../../../contracts/openapi.platform.json", import.meta.url),
      "utf8",
    ),
  );
  expect(spec.paths["/platform/billing/reminders"]).toBeUndefined();
  expect(spec.components.schemas.PlatformSession.required).toContain(
    "paidUntil",
  );
  expect(
    spec.components.schemas.PlatformSession.properties.paidUntil,
  ).toMatchObject({ type: "number", nullable: true });
  expect(
    spec.paths["/platform/sessions/{sessionId}/start"].post.responses["402"],
  ).toBeDefined();
  expect(spec.components.schemas.SessionTierOverrideRequest.required).toEqual([
    "quoteId",
  ]);
  expect(spec.components.schemas.NumberTierQuoteRequest.required).toEqual([
    "tierOverride",
  ]);
  expect(spec.paths["/platform/sessions/{sessionId}"].get.operationId).toBe(
    "getSession",
  );
  expect(spec.paths["/platform/sessions/{sessionId}"].put.operationId).toBe(
    "updateSession",
  );
  expect(
    spec.paths["/platform/sessions/{sessionId}/tier-quotes"].post.operationId,
  ).toBe("quoteSessionTierChange");
});
