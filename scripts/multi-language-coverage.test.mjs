import { test } from "node:test";
import assert from "node:assert/strict";
import { compareCoverage, SDK_LANGUAGES } from "./check-coverage.mjs";
const operation = {
  family: "messaging",
  method: "GET",
  path: "/messaging/example",
  operationId: "example",
  fingerprint: "a".repeat(64),
};
function ledger() {
  return {
    schemaVersion: 2,
    languages: SDK_LANGUAGES,
    sourceCommit: "b".repeat(40),
    operations: [
      {
        ...operation,
        ...Object.fromEntries(
          SDK_LANGUAGES.map((language) => [
            language,
            { status: "covered", method: `${language}.Example` },
          ]),
        ),
      },
    ],
  };
}
test("one language's gap stays visible when TypeScript is complete", () => {
  const input = ledger();
  input.operations[0].go = {
    status: "missing",
    reason: "No handwritten method",
    milestone: "go-parity",
  };
  const report = compareCoverage([operation], input, true);
  assert.equal(report.covered, 1);
  assert.equal(report.languages.go.missing, 1);
  assert.deepEqual(report.gaps[0].affectedLanguages, ["go"]);
  assert.equal(report.gaps[0].languages.typescript.status, "covered");
});
test("contract drift marks each language for review", () => {
  const report = compareCoverage(
    [{ ...operation, fingerprint: "c".repeat(64) }],
    ledger(),
    false,
  );
  assert.throws(
    () =>
      compareCoverage(
        [{ ...operation, fingerprint: "c".repeat(64) }],
        ledger(),
        true,
      ),
    /contract drift/,
  );
  assert.throws(
    () => compareCoverage([], ledger(), true),
    /removed operations/,
  );
  for (const language of SDK_LANGUAGES)
    assert.equal(report.languages[language].changed, 1);
  assert.deepEqual(Object.keys(report.gaps[0].languages), SDK_LANGUAGES);
});
test("a missing language and a coverage entry without a method fail closed", () => {
  const input = ledger();
  delete input.operations[0].rust;
  assert.throws(
    () => compareCoverage([operation], input, true),
    /rust coverage/,
  );
  input.operations[0].rust = { status: "covered" };
  assert.throws(() => compareCoverage([operation], input, true), /rust method/);
});

import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkNativeSupplements, methodToken } from "./native-supplements.mjs";
const root = resolve(import.meta.dirname, "..");
const inventory = () =>
  JSON.parse(
    readFileSync(resolve(root, "contracts/native-campaign-supplements.json")),
  );
test("the integrated campaign supplement inventory maps eleven operations in every language", () => {
  const result = checkNativeSupplements(root, inventory());
  assert.equal(result.operations, 11);
  assert.ok(result.fields > 0);
  assert.equal(
    methodToken("OrganizationClient.Campaigns().GetFrequencyCap"),
    "GetFrequencyCap",
  );
  assert.equal(
    methodToken("Client::audienceSegments.previewRules"),
    "previewRules",
  );
});
test("supplement inventory drift and missing native evidence fail closed", () => {
  const cases = [
    [(v) => (v.supplements[0].commit = "f".repeat(40)), /commit drifted/],
    [
      (v) => (v.supplements[1].sources.platform = "0".repeat(64)),
      /hash drifted/,
    ],
    [
      (v) => (v.operations[0].path = "/platform/campaign-settings/missing"),
      /is not in/,
    ],
    [(v) => (v.operations[0].operationId = "renamed"), /operationId differs/],
    [(v) => delete v.operations[1].languages.rust, /must map every language/],
    [
      (v) => (v.operations[2].languages.go.status = "partial"),
      /must be covered/,
    ],
    [
      (v) => (v.operations[3].languages.php.testFile = "tests/missing.php"),
      /wire test does not exist/,
    ],
    [
      (v) => (v.operations[4].languages.python.testFile = "../../README.md"),
      /inside the package/,
    ],
    [
      (v) =>
        (v.operations[5].languages.dotnet.sdkMethod =
          "OrganizationClient.AudienceSegments.NeverCalledAsync"),
      /test does not call/,
    ],
    [
      (v) =>
        (v.operations[6].languages.go.sdkMethod =
          "OrganizationClient.AudienceSegments().Retrieve2"),
      /does not call|source lacks/,
    ],
    [(v) => (v.fields[0].contractName = "MissingSchema.field"), /is not in/],
    [(v) => (v.fields[1].native.rust = "NoSuchRustIdentifier"), /source lacks/],
    [(v) => (v.baselineLedger.operations = 638), /579|Expected values/],
  ];
  for (const [mutate, expected] of cases) {
    const value = inventory();
    mutate(value);
    assert.throws(() => checkNativeSupplements(root, value), expected);
  }
});
