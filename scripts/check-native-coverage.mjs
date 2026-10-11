import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { resolve, relative, isAbsolute } from "node:path";
import { SDK_LANGUAGES } from "./check-coverage.mjs";

const root = resolve(import.meta.dirname, "..");
const ledger = JSON.parse(
  readFileSync(resolve(root, "contracts/coverage.json")),
);
const requested = process.argv[2];
const languages = requested
  ? [requested]
  : SDK_LANGUAGES.filter((language) => language !== "typescript");
for (const language of languages) {
  assert.ok(
    SDK_LANGUAGES.includes(language) && language !== "typescript",
    "Unknown native language",
  );
  const packageRoot = resolve(root, "packages", language);
  const manifestPath = resolve(packageRoot, "coverage.json");
  if (!existsSync(manifestPath)) {
    assert.equal(
      ledger.operations.filter(
        (operation) => operation[language].status === "covered",
      ).length,
      0,
      `${language} claims coverage without native evidence`,
    );
    continue;
  }
  const manifest = JSON.parse(readFileSync(manifestPath));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(
    manifest.sourceSdkCommit,
    "ff51567105b64bf6997e7330ba8eb502d875e7b9",
  );
  assert.ok(Array.isArray(manifest.operations));
  const key = (entry) => `${entry.family}|${entry.method}|${entry.path}`;
  const mappings = new Map();
  for (const entry of manifest.operations) {
    assert.ok(
      !mappings.has(key(entry)),
      `${language} duplicate native mapping`,
    );
    mappings.set(key(entry), entry);
  }
  for (const operation of ledger.operations) {
    const mapping = mappings.get(key(operation));
    assert.ok(mapping, `${language} missing native mapping: ${key(operation)}`);
    assert.equal(
      mapping.status,
      operation[language].status,
      `${language} status differs: ${key(operation)}`,
    );
    if (mapping.status !== "covered") continue;
    assert.equal(
      mapping.sdkMethod,
      operation[language].method,
      `${language} public mapping differs`,
    );
    assert.ok(
      typeof mapping.testFile === "string" && mapping.testFile.length > 0,
      `${language} covered operation lacks a wire test`,
    );
    const testFile = resolve(packageRoot, mapping.testFile);
    const local = relative(packageRoot, testFile);
    assert.ok(
      local && !local.startsWith("..") && !isAbsolute(local),
      "Wire evidence must stay inside the package",
    );
    assert.ok(existsSync(testFile), `${language} wire test does not exist`);
  }
  // Native CI must also execute the tests. A manifest proves attribution only.
  console.log(`${language}: native coverage mapping matches the ledger`);
}
