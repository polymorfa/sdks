// Source attribution only. Native execution and release acceptance are separate gates.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const json = (file) => JSON.parse(readFileSync(resolve(root, file), "utf8"));
export function checkBusinessAccountModes() {
  const pin = json("contracts/business-account-modes.json");
  const inventory = json("contracts/native-business-account-modes.json");
  const languages = ["typescript", "go", "python", "php", "rust", "dotnet"];
  assert.match(pin.commit, /^[a-f0-9]{40}$/);
  assert.match(pin.sources.messaging.sourceSha256, /^[a-f0-9]{64}$/);
  assert.equal(pin.releaseStatus, "source-only");
  assert.equal(inventory.sourceCommit, pin.commit);
  assert.equal(inventory.published, false);
  assert.equal(inventory.baselineUnchanged, true);
  assert.equal(
    json("contracts/source.json").commit,
    "171a9683ff45d11a4b5d3917dc428ad2722b0d99",
  );
  const schemas = pin.sources.messaging.components.schemas;
  assert.deepEqual(
    schemas.TestingAccountModeRequest.properties.accountType.enum,
    ["whatsapp_app", "business_app", "meta_cloud", "meta_coexistence"],
  );
  assert.deepEqual(
    schemas.TestingAccountModeRequest.properties.primaryPlatform.enum,
    ["android", "ios"],
  );
  assert.ok(schemas.TestingAccountModeRequest.required.includes("accountType"));
  assert.deepEqual(schemas.BusinessProfile.properties.encryption.enum, [
    "end_to_end",
    "hybrid",
    "not_end_to_end",
  ]);
  assert.ok(!schemas.BusinessProfile.required.includes("encryption"));
  assert.equal(inventory.operations.length, 1);
  for (const operation of inventory.operations) {
    assert.equal(
      pin.sources.messaging.paths[operation.path][
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
      assert.ok(entry.method.length);
      const test = readFileSync(
        resolve(root, "packages", language, entry.test),
        "utf8",
      );
      assert.ok(
        test.includes("account-mode"),
        language + " is missing a native wire fixture",
      );
      if (language !== "typescript")
        assert.equal(
          json(`packages/${language}/coverage.json`).supplements
            .businessAccountModes.language,
          language,
        );
    }
  }
  assert.equal(
    json("contracts/coverage.json").supplements.businessAccountModes.inventory,
    "contracts/native-business-account-modes.json",
  );
  console.log(
    "Business supplement: one operation, QuickLink mode/platform and optional encryption fields attributed across six SDKs; baseline unchanged.",
  );
}
if (process.argv[1] === new URL(import.meta.url).pathname)
  checkBusinessAccountModes();
