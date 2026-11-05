// Source attribution only. Native CI executes the mapped wire fixtures.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { NATIVE_SUPPLEMENT_LANGUAGES } from "./native-supplements.mjs";

export const INTERACTIVE_INVENTORY =
  "contracts/native-interactive-messages.json";
const PIN = "contracts/interactive-messages.json";
const BASELINE = {
  sourceApiCommit: "171a9683ff45d11a4b5d3917dc428ad2722b0d99",
  sourceSdkCommit: "e24cb176fc1124f5fe852ff6c77902648fd13b4a",
  operations: 579,
};
const FIELDS = {
  mediaHeader: "/buttonsContent/properties/buttons/properties/media",
  carousel: "/carouselContent/properties/carousel",
};
const GROUPS = [...Object.keys(FIELDS), "campaignReplies"];

export function checkInteractiveSupplement(root, options = {}) {
  const read = options.readFile ?? readFileSync;
  const text = (path) => read(resolve(root, path), "utf8");
  const json = (path) => JSON.parse(text(path));
  const inventory = options.inventory ?? json(INTERACTIVE_INVENTORY);
  const ledger = options.ledger ?? json("contracts/coverage.json");
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.pin, PIN, "interactive pin path drifted");
  assert.equal(inventory.published, false);
  assert.equal(inventory.baselineUnchanged, true);
  assert.deepEqual(
    inventory.baseline,
    BASELINE,
    "interactive baseline drifted",
  );
  assert.equal(ledger.sourceCommit, BASELINE.sourceApiCommit);
  assert.equal(json("contracts/source.json").commit, BASELINE.sourceApiCommit);
  assert.equal(ledger.operations.length, BASELINE.operations);

  const pinBytes = read(resolve(root, PIN));
  const pin = JSON.parse(pinBytes);
  assert.equal(
    inventory.sourceCommit,
    pin.commit,
    "interactive API commit drifted",
  );
  assert.equal(
    inventory.sourceSha256,
    pin.sourceSha256,
    "interactive API hash drifted",
  );
  assert.equal(
    inventory.contractSha256,
    createHash("sha256").update(pinBytes).digest("hex"),
    "interactive snapshot drifted",
  );
  assert.deepEqual(
    inventory.fields,
    FIELDS,
    "interactive field inventory drifted",
  );
  for (const pointer of Object.values(FIELDS)) {
    const schema = pointer
      .slice(1)
      .split("/")
      .reduce((node, key) => node?.[key], pin);
    assert.ok(schema?.properties, `interactive field is absent: ${pointer}`);
  }
  assert.deepEqual(
    Object.keys(inventory.languages).sort(),
    [...NATIVE_SUPPLEMENT_LANGUAGES].sort(),
    "interactive inventory must map all six languages",
  );

  for (const language of NATIVE_SUPPLEMENT_LANGUAGES) {
    const mapping = inventory.languages[language];
    const manifest =
      language === "typescript"
        ? ledger
        : json(`packages/${language}/coverage.json`);
    if (language !== "typescript") {
      assert.equal(manifest.sourceSdkCommit, BASELINE.sourceSdkCommit);
    }
    assert.deepEqual(
      manifest.supplements?.interactiveMessages,
      {
        inventory: INTERACTIVE_INVENTORY,
        language,
        baselineUnchanged: true,
        published: false,
      },
      `${language} interactive coverage registration drifted`,
    );
    for (const [operationId, key] of [
      ["sendMessage", "sendMethod"],
      ["createPlatformCampaign", "campaignMethod"],
    ]) {
      const operation = ledger.operations.find(
        (entry) => entry.operationId === operationId,
      );
      assert.equal(operation?.[language]?.status, "covered");
      assert.equal(
        mapping[key],
        operation[language].method,
        `${language} public method drifted`,
      );
    }
    const packageRoot = resolve(root, "packages", language);
    const packageText = (path) => {
      assert.ok(
        typeof path === "string" && !isAbsolute(path),
        "Evidence path must be relative",
      );
      const file = resolve(packageRoot, path);
      const local = relative(packageRoot, file);
      assert.ok(
        local && !local.startsWith("..") && !isAbsolute(local),
        "Evidence must stay inside its package",
      );
      return read(file, "utf8");
    };
    for (const group of GROUPS) {
      const evidence = mapping[group];
      assert.ok(evidence, `${language} lacks ${group} attribution`);
      const source = packageText(evidence.sourceFile);
      const wire = packageText(evidence.testFile);
      for (const [needles, corpus, kind] of [
        [evidence.symbols, source, "source symbol"],
        [evidence.testNeedles, wire, "wire evidence"],
      ]) {
        assert.ok(
          Array.isArray(needles) && needles.length > 0,
          `${language} ${group} lacks ${kind}`,
        );
        for (const needle of needles) {
          assert.ok(
            typeof needle === "string" && needle.length > 0,
            "Empty attribution marker",
          );
          assert.ok(
            corpus.includes(needle),
            `${language} ${group} ${kind} missing: ${needle}`,
          );
        }
      }
    }
  }
  return {
    languages: NATIVE_SUPPLEMENT_LANGUAGES.length,
    fields: Object.keys(FIELDS).length,
    wireGroups: GROUPS.length,
  };
}
