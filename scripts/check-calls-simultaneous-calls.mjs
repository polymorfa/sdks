// Scoped source attribution. This does not certify native execution or publication.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const json = (p) => JSON.parse(readFileSync(resolve(root, p)));
export function checkCallsSimultaneous() {
  const pin = json("contracts/calls-simultaneous-calls.json");
  const inventory = json("contracts/native-calls-simultaneous-calls.json");
  assert.equal(pin.commit, "c1a43a1eb409ad57c2b9677c606a3d42d7b5598c");
  assert.equal(inventory.sourceCommit, pin.commit);
  assert.equal(pin.sourceAccepted, true);
  assert.equal(pin.published, false);
  assert.equal(inventory.published, false);
  assert.equal(
    json("contracts/source.json").commit,
    "171a9683ff45d11a4b5d3917dc428ad2722b0d99",
  );
  for (const source of Object.values(pin.sources)) {
    assert.match(source.sourceSha256, /^[a-f0-9]{64}$/);
    const fragment = readFileSync(resolve(root, source.fragmentPath));
    assert.equal(
      createHash("sha256").update(fragment).digest("hex"),
      source.fragmentSha256,
    );
    assert.deepEqual(JSON.parse(fragment), {
      schemas: source.schemas,
      operations: source.operations ?? {},
    });
  }
  const languages = ["typescript", "go", "python", "php", "rust", "dotnet"];
  for (const operation of inventory.operations) {
    assert.equal(
      pin.sources.platform.operations[operation.path][
        operation.method.toLowerCase()
      ].operationId,
      operation.operationId,
    );
    assert.deepEqual(
      Object.keys(operation.languages).sort(),
      [...languages].sort(),
    );
    for (const [language, item] of Object.entries(operation.languages)) {
      assert.ok(item.method.length > 0);
      assert.ok(
        readFileSync(
          resolve(root, `packages/${language}/${item.test}`),
        ).includes(Buffer.from("simultaneous")),
      );
      const coverage = json(
        language === "typescript"
          ? "contracts/coverage.json"
          : `packages/${language}/coverage.json`,
      );
      assert.equal(
        coverage.supplements.simultaneousCalls.inventory,
        "contracts/native-calls-simultaneous-calls.json",
      );
    }
  }
  console.log(
    "Calls supplement source attribution passed; execution and publication remain separate.",
  );
}
checkCallsSimultaneous();
