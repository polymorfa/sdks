// Source attribution and pin drift checks. This never claims native runtime parity.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const read = (path) => readFileSync(resolve(root, path));
const json = (path) => JSON.parse(read(path));
export function checkOfficialRound2() {
  const pin = json("contracts/official-api-round2.json");
  const inventory = json(pin.nativeInventory);
  const languages = ["typescript", "go", "python", "php", "rust", "dotnet"];
  assert.equal(pin.published, false);
  assert.equal(inventory.published, false);
  assert.equal(inventory.sourceCommit, pin.sourceCommit);
  assert.equal(
    json("contracts/source.json").commit,
    "171a9683ff45d11a4b5d3917dc428ad2722b0d99",
  );
  for (const item of pin.items)
    assert.equal(
      createHash("sha256").update(read(item.snapshotPath)).digest("hex"),
      item.snapshotSha256,
    );
  for (const operation of inventory.operations) {
    assert.equal(
      json(operation.snapshot).paths[operation.path][
        operation.method.toLowerCase()
      ].operationId,
      operation.operationId,
    );
    assert.deepEqual(
      Object.keys(operation.languages).sort(),
      [...languages].sort(),
    );
    for (const language of languages) {
      const entry = operation.languages[language];
      assert.ok(read(`packages/${language}/${entry.test}`).length > 0);
      assert.ok(entry.method.length > 0);
    }
  }
  for (const language of languages.filter((l) => l !== "typescript"))
    assert.equal(
      json(`packages/${language}/coverage.json`).supplements.officialApiRound2
        .language,
      language,
    );
  const fixture = json("contracts/fixtures/official-round2.json");
  assert.equal(fixture.readinessCodes.length, 6);
  assert.ok(
    fixture.readinessCodes.every((code) => !pin.errorCodes.includes(code)),
  );
  assert.equal(
    createHash("sha256")
      .update(read("contracts/machine-credentials.v1.json"))
      .digest("hex"),
    "7694d8eb61dca6aed69f41392d2e5fae585084e330b276ee6a71844ef9e2365d",
  );
  console.log(
    `Official beta supplement: ${inventory.operations.length} new native operations and ${Object.keys(inventory.fields).length} field/delivery groups attributed in six languages; execution and packaging are separate gates.`,
  );
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  checkOfficialRound2();
