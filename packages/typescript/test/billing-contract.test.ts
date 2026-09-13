import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("pins the draft billing contract and keeps confirmation separate from quoting", () => {
  const bytes = readFileSync(
    new URL(
      "../../../contracts/billing-redesign.openapi.json",
      import.meta.url,
    ),
  );
  const source = JSON.parse(
    readFileSync(
      new URL(
        "../../../contracts/billing-redesign.source.json",
        import.meta.url,
      ),
      "utf8",
    ),
  );
  expect(createHash("sha256").update(bytes).digest("hex")).toBe(
    source.snapshotSha256,
  );
  const spec = JSON.parse(bytes.toString());
  const paths = spec.paths as Record<
    string,
    Record<string, { operationId: string }>
  >;
  expect(
    Object.values(paths)
      .flatMap((path) => Object.values(path).map((op) => op.operationId))
      .sort(),
  ).toEqual(source.operationIds);
  expect(spec.paths["/platform/billing/reminders"]).toBeUndefined();
  expect(spec.components.schemas.SessionTierOverrideRequest.required).toEqual([
    "quoteId",
  ]);
  expect(spec.components.schemas.NumberTierQuoteRequest.required).toEqual([
    "tierOverride",
  ]);
  expect(
    spec.components.schemas.NumberTierChange.properties.quote.properties
      .amountCents,
  ).toMatchObject({ type: "number", multipleOf: 0.000001 });
});
