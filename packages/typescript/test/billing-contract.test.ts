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
  expect(spec.components.schemas.PlatformSession.required).toContain(
    "paidUntil",
  );
  expect(
    spec.components.schemas.PlatformSession.properties.paidUntil,
  ).toMatchObject({ type: "number", nullable: true });
  expect(
    spec.paths["/platform/sessions/{sessionId}/start"].post.responses["402"],
  ).toEqual({ $ref: "#/components/responses/BillingCreditRequired" });
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

it("pins billing and session access to the same reviewed API revision", () => {
  const sources = ["billing-redesign", "platform-access"].map((name) => {
    const source = JSON.parse(
      readFileSync(
        new URL(`../../../contracts/${name}.source.json`, import.meta.url),
        "utf8",
      ),
    );
    const bytes = readFileSync(
      new URL(`../../../${source.snapshotPath}`, import.meta.url),
    );
    expect(createHash("sha256").update(bytes).digest("hex")).toBe(
      source.snapshotSha256,
    );
    expect(source.repository).toBe("polymorfa/polymorfa");
    expect(source.baseCommit).toBe("0d62656002fe7274f4e86c47f334429d5f1d4800");
    const operations = Object.values(
      JSON.parse(bytes.toString()).paths,
    ).flatMap((path) =>
      Object.values(path as Record<string, { operationId?: string }>).map(
        (op) => op.operationId,
      ),
    );
    for (const id of source.operationIds) expect(operations).toContain(id);
    return source;
  });
  expect(sources[0].baseCommit).toBe(sources[1].baseCommit);
});
