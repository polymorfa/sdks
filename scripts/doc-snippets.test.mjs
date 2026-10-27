import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";
import {
  generate,
  readJSON,
  root,
  serialize,
  sourceDigest,
  validateCatalog,
  validatePackageMetadata,
} from "./doc-snippets/catalog.mjs";
import { languages } from "./doc-snippets/recipes.mjs";
const catalog = readJSON("contracts/doc-snippets.json");
const copy = () => structuredClone(catalog);

test("deterministic export, exact SDK/API pins, six languages and no unpublished installs", async () => {
  assert.equal(
    await serialize(await generate()),
    readFileSync(`${root}/contracts/doc-snippets.json`, "utf8"),
  );
  assert.equal(catalog.releaseStatus, "source-only");
  for (const language of languages) {
    assert.ok(catalog.operations.sendMessage[language]);
    assert.equal(
      Object.values(catalog.operations).filter((o) => o[language]).length,
      31,
    );
    assert.ok(
      Object.values(catalog.operations).every(
        (o) => !("install" in o[language]),
      ),
    );
  }
  assert.equal(catalog.sourceFilesSha256, sourceDigest(catalog.sourceCommit));
});

test("rejects malformed and renamed spec placeholders", () => {
  for (const replacement of [
    "{{session}}",
    "{{session-id}}",
    "fixture-session",
  ]) {
    const c = copy();
    c.operations.getSession.typescript.code =
      c.operations.getSession.typescript.code.replace(
        "{{sessionId}}",
        replacement,
      );
    assert.throws(
      () => validateCatalog(c, { checkSource: false }),
      /invalid placeholders/,
    );
  }
});

test("rejects uncovered operations and extra schema fields", () => {
  const c = copy();
  c.operations.inventedOperation = c.operations.sendMessage;
  assert.throws(
    () => validateCatalog(c, { checkSource: false }),
    /Uncovered operation/,
  );
  const d = copy();
  d.operations.sendMessage.typescript.install = "unreleased package";
  assert.throws(() => validateCatalog(d), /additional properties/);
});

test("rejects missing/invalid body and invalid union branches", () => {
  for (const body of [
    {},
    { name: "Featured", productIds: [] },
    { name: 4, productIds: ["p"] },
  ]) {
    const c = copy();
    c.operations.createBusinessCollection.request.body = body;
    assert.throws(
      () => validateCatalog(c, { checkSource: false }),
      /invalid body/,
    );
  }
  const c = copy();
  delete c.operations.createBusinessCollection.request.body;
  assert.throws(
    () => validateCatalog(c, { checkSource: false }),
    /missing request body/,
  );
  for (const content of [
    {},
    { text: "Hello", poll: { name: "Pick", options: ["A", "B"] } },
    { text: 42 },
  ]) {
    const d = copy();
    d.operations.sendMessage.request.body.content = content;
    assert.throws(
      () => validateCatalog(d, { checkSource: false }),
      /invalid body/,
    );
  }
});

test("rejects missing, unknown and schema-invalid required queries", () => {
  for (const query of [{}, { id: "invalid" }, { id: "42", invented: true }]) {
    const c = copy();
    c.operations.getBusinessCatalog.request.query = query;
    assert.throws(() => validateCatalog(c, { checkSource: false }), /query/);
  }
});

test("rejects stale source, API, spec and bound source digests", () => {
  for (const field of [
    "sourceCommit",
    "apiSourceCommit",
    "apiVersion",
    "sourceFilesSha256",
  ]) {
    const c = copy();
    c[field] =
      field === "apiVersion"
        ? "2026-09-21"
        : field === "sourceFilesSha256"
          ? "0".repeat(64)
          : "0".repeat(40);
    assert.throws(() => validateCatalog(c), /Stale/);
  }
  const c = copy();
  c.specs.messaging = "0".repeat(64);
  assert.throws(
    () => validateCatalog(c, { checkSource: false }),
    /Stale catalog spec hashes/,
  );
  assert.throws(
    () => sourceDigest("63a1776c761ab3e03ecbdbce7af11bece1d6393f"),
    /source file inventory changed/,
  );
});

test("rejects raw and unchecked exported calls", () => {
  const c = copy();
  c.operations.sendMessage.typescript.code += "\nconst result: any = {};\n";
  assert.throws(
    () => validateCatalog(c, { checkSource: false }),
    /forbidden unchecked/,
  );
});

test("CLI drift check validates committed JSON instead of only recipes", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/generate-doc-snippets.mjs", "--check"],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr);
});
// Compiler-negative behavior is exercised by verify-doc-snippets --negative-test
// in shared CI (tsc) and every native runtime matrix job. It changes the actual
// exported sendMessage call, runs the real checker and requires its diagnostic
// to name the nonexistent public method. No API call is executed.

test("package metadata must match source manifests and transport constants", () => {
  const metadata = structuredClone(catalog.packages);
  metadata.python.version = "0.1.0-dev.0";
  assert.throws(
    () => validatePackageMetadata(metadata),
    /Stale package metadata/,
  );
});

test("CLI --check fails on an altered exported program", () => {
  const scratch = join(
    homedir(),
    ".polymorfa-agent-work/sdk-doc-snippets-20261019/negative-fixtures",
  );
  mkdirSync(scratch, { recursive: true, mode: 0o700 });
  const dir = mkdtempSync(join(scratch, "drift-"));
  const bad = copy();
  bad.operations.sendMessage.typescript.code =
    bad.operations.sendMessage.typescript.code.replace(
      "messages.send(",
      "messages.invented(",
    );
  const file = join(dir, "doc-snippets.json");
  writeFileSync(file, JSON.stringify(bad));
  const result = spawnSync(
    process.execPath,
    ["scripts/generate-doc-snippets.mjs", "--check", "--file", file],
    { cwd: root, encoding: "utf8" },
  );
  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /snippets drifted/);
});
