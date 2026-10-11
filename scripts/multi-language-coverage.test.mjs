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
    true,
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
