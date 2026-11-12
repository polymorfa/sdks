import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { checkBusinessAccountModes } from "./check-business-account-modes.mjs";
const root = resolve(import.meta.dirname, "..");
const read = (file) => readFileSync(resolve(root, file), "utf8");
const load = (file) => JSON.parse(read(file));
function run(edit = () => {}, evidence = (_file, source) => source) {
  const cache = new Map();
  const json = (file) => {
    if (!cache.has(file)) cache.set(file, structuredClone(load(file)));
    return cache.get(file);
  };
  edit(json);
  return () =>
    checkBusinessAccountModes({
      json,
      text: (file) => evidence(file, read(file)),
    });
}
const inventory = "contracts/native-business-account-modes.json";
const pin = "contracts/business-account-modes.json";
test("accepts the committed field and operation attribution", () => {
  assert.doesNotThrow(run());
});
test("fails when the field attribution is removed", () => {
  assert.throws(run((json) => delete json(inventory).fields.quickLinkTesting));
  assert.throws(
    run((json) => delete json(inventory).fields.businessProfileEncryption),
  );
  assert.throws(run((json) => delete json(inventory).fields));
});
test("fails when a pinned schema property is removed", () => {
  assert.throws(
    run(
      (json) =>
        delete json(pin).sources.messaging.components.schemas
          .QuickLinkConfiguration.properties.testing.properties.configuration
          .properties.primaryPlatform,
    ),
  );
  assert.throws(
    run(
      (json) =>
        delete json(pin).sources.messaging.components.schemas.BusinessProfile
          .properties.encryption,
    ),
  );
});
test("fails when a language loses its field evidence", () => {
  assert.throws(
    run(undefined, (file, source) =>
      file === "packages/go/business_account_modes_test.go"
        ? source
            .replaceAll("primaryPlatform", "x")
            .replaceAll("encryption", "y")
        : source,
    ),
  );
  assert.throws(
    run(
      (json) => delete json(inventory).fields.quickLinkTesting.languages.rust,
    ),
  );
});
