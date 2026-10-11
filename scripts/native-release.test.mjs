import assert from "node:assert/strict";
import test from "node:test";
import {
  nativeLanguages,
  requireNativeCoverage,
  versions,
} from "./native-release.mjs";

test("native version formats preserve one release across registries", () => {
  assert.deepEqual(versions("stable", "0.2.3"), {
    semver: "0.2.3",
    python: "0.2.3",
    goTag: "packages/go/v0.2.3",
  });
  assert.deepEqual(
    versions("nightly", undefined, new Date("2026-10-11T01:02:03Z")),
    {
      semver: "0.1.0-dev.20261011010203",
      python: "0.1.0.dev20261011010203",
      goTag: "packages/go/v0.1.0-dev.20261011010203",
    },
  );
  assert.throws(() => versions("stable", "0.2.3-dev.1"));
});
function fixture() {
  const operation = {
    family: "messaging",
    method: "GET",
    path: "/messaging/test",
    typescript: { status: "covered" },
  };
  const manifests = Object.fromEntries(
    nativeLanguages.map((language) => {
      operation[language] = { status: "covered" };
      return [
        language,
        {
          sourceSdkCommit: "a".repeat(40),
          operations: [
            {
              ...operation,
              status: "covered",
              sdkMethod: "Test.Read",
              testFile: "test",
            },
          ],
        },
      ];
    }),
  );
  return { ledger: { schemaVersion: 2, operations: [operation] }, manifests };
}
test("release refuses missing language, stale ledger and unsupported TypeScript method", () => {
  const { ledger, manifests } = fixture();
  requireNativeCoverage(ledger, manifests);
  manifests.php.operations = [];
  assert.throws(() => requireNativeCoverage(ledger, manifests), /php: missing/);
  const f = fixture();
  f.manifests.python.operations[0].status = "excluded";
  f.manifests.python.operations[0].reason = "later";
  f.ledger.operations[0].python.status = "excluded";
  assert.throws(
    () => requireNativeCoverage(f.ledger, f.manifests),
    /missing pinned TypeScript method/,
  );
  const g = fixture();
  g.ledger.operations[0].rust.status = "partial";
  assert.throws(
    () => requireNativeCoverage(g.ledger, g.manifests),
    /ledger mismatch/,
  );
});
