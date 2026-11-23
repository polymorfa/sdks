import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("keeps reviewed billing and connection administration in the canonical Platform contract", () => {
  const spec = JSON.parse(
    readFileSync(
      new URL("../../../contracts/openapi.platform.json", import.meta.url),
      "utf8",
    ),
  );
  expect(spec.paths["/platform/billing/reminders"]).toBeUndefined();
  expect(spec.components.schemas.PlatformConnection.required).toContain(
    "paidUntil",
  );
  expect(
    spec.components.schemas.PlatformConnection.properties.paidUntil,
  ).toMatchObject({ type: "number", nullable: true });
  expect(
    spec.paths["/platform/connections/{connectionId}/start"].post.responses[
      "402"
    ],
  ).toBeDefined();
  expect(
    spec.components.schemas.ConnectionTierOverrideRequest.required,
  ).toEqual(["quoteId"]);
  expect(spec.components.schemas.ConnectionTierQuoteRequest.required).toEqual([
    "tierOverride",
  ]);
  expect(
    spec.paths["/platform/connections/{connectionId}"].get.operationId,
  ).toBe("getConnection");
  expect(
    spec.paths["/platform/connections/{connectionId}"].put.operationId,
  ).toBe("updateConnection");
  expect(
    spec.paths["/platform/connections/{connectionId}/tier-quotes"].post
      .operationId,
  ).toBe("quoteConnectionTierChange");
});
