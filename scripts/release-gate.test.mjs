import { test } from "node:test";
import assert from "node:assert/strict";
import { validateAcceptance, releaseVersion } from "./release-gate.mjs";
const expected = {
  sourceSha: "a".repeat(40),
  apiVersion: "2026-09-22",
  environment: "staging",
  contracts: {
    messaging: {
      sourcePath: "apps/api/docs/openapi.json",
      sha256: "b".repeat(64),
    },
    platform: {
      sourcePath: "apps/api/docs/openapi.management.json",
      sha256: "c".repeat(64),
    },
  },
};
const receipt = {
  ...expected,
  schemaVersion: 1,
  repository: "polymorfa/polymorfa",
  result: "passed",
  scenarios: [{ result: "passed" }],
  deployment: { commit: expected.sourceSha, status: "finished" },
  acceptedAt: "2026-10-04T02:00:00Z",
  runUrl: "https://github.com/polymorfa/polymorfa/actions/runs/123",
};
test("nightly requires exact staging acceptance; stable requires production", () => {
  assert.equal(validateAcceptance(receipt, expected), receipt);
  for (const delta of [
    { environment: "production" },
    { sourceSha: "d".repeat(40) },
    { apiVersion: "2026-09-23" },
    { contracts: {} },
  ])
    assert.throws(() => validateAcceptance({ ...receipt, ...delta }, expected));
  assert.throws(() =>
    validateAcceptance(receipt, { ...expected, environment: "production" }),
  );
});
test("source merge and health are insufficient without actual passed scenarios", () => {
  for (const delta of [
    { result: "failed" },
    { scenarios: [] },
    { scenarios: [{ result: "failed" }] },
    { deployment: { commit: "d".repeat(40), status: "finished" } },
    { runUrl: "https://example.com/untrusted" },
  ])
    assert.throws(() => validateAcceptance({ ...receipt, ...delta }, expected));
});
test("nightly timestamp changes package version without changing API contract date", () => {
  assert.equal(
    releaseVersion(
      "nightly",
      undefined,
      "0.1.0",
      new Date("2026-10-04T02:00:00Z"),
    ),
    "0.1.0-dev.20261004020000",
  );
  assert.equal(receipt.apiVersion, "2026-09-22");
  assert.equal(releaseVersion("stable", "0.1.0", "0.1.0"), "0.1.0");
  for (const version of ["0.1.0-dev.1", "2026-09-22", "01.1.0", ""])
    assert.throws(() => releaseVersion("stable", version, "0.1.0"));
  assert.throws(() => releaseVersion("nightly", "0.1.0", "0.1.0"));
});
