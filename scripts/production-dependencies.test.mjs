import assert from "node:assert/strict";
import {
  existsSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { createRequire } from "node:module";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("..", import.meta.url));
const modules = realpathSync(join(root, "node_modules"));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));

function dependency(parent, name) {
  const entry = realpathSync(parent.resolve(name));
  const insideModules = (path) => {
    const fromModules = relative(modules, path);
    return (
      fromModules !== ".." &&
      !fromModules.startsWith(`..${sep}`) &&
      !isAbsolute(fromModules)
    );
  };
  assert.ok(
    insideModules(entry),
    `${name} must resolve inside this checkout's installed graph`,
  );
  for (
    let directory = dirname(entry);
    directory !== modules && insideModules(directory);
    directory = dirname(directory)
  ) {
    const manifestPath = join(directory, "package.json");
    if (!existsSync(manifestPath)) continue;
    const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    if (manifest.name !== name) continue;
    return {
      path: manifestPath,
      manifest,
      require: createRequire(manifestPath),
    };
  }
  assert.fail(`No installed package manifest found for ${name}`);
}

const firestore = dependency(
  createRequire(join(root, "package.json")),
  "@google-cloud/firestore",
);
const api = dependency(firestore.require, "@google-cloud/firestore-api");
const gax = dependency(api.require, "google-gax");
const removal = dependency(gax.require, "rimraf");
const pattern = dependency(removal.require, "glob");
const matcher = dependency(pattern.require, "minimatch");
// Load only the removal utility. No Firestore client or credentials are created.
const { rimraf, rimrafSync } = removal.require("rimraf");

function fixture(t) {
  const directory = mkdtempSync(
    join(dirname(root), "sdk-removal-compatibility-"),
  );
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = join(directory, "remove-first.txt");
  const second = join(directory, "remove-second.txt");
  const sentinel = join(directory, "keep.txt");
  for (const path of [first, second, sentinel]) writeFileSync(path, "fixture");
  return { directory, first, second, sentinel };
}

test("the legacy Firestore chain retains its locked versions and production classification", () => {
  assert.equal(firestore.manifest.version, "9.3.1");
  assert.equal(api.manifest.version, "0.2.0");
  assert.equal(gax.manifest.version, "5.0.8");
  assert.equal(removal.manifest.version, "5.0.10");
  for (const entry of [firestore, api, gax, removal, pattern, matcher]) {
    const key = relative(root, dirname(entry.path)).split(sep).join("/");
    const locked = lock.packages[key];
    assert.ok(locked, `${key} must be present in the selected lock`);
    assert.equal(locked.version, entry.manifest.version);
    assert.notEqual(
      locked.dev,
      true,
      `${key} must not be reclassified as dev-only`,
    );
  }
});

test("the exact legacy removal consumer resolves patched Glob and Minimatch", () => {
  assert.equal(pattern.manifest.version, "14.0.2");
  assert.equal(matcher.manifest.version, "11.0.4");
});

test("legacy asynchronous removal preserves literal path behavior", async (t) => {
  const { first, second, sentinel } = fixture(t);
  assert.equal(await rimraf(first), true);
  assert.equal(existsSync(first), false);
  assert.equal(existsSync(second), true);
  assert.equal(readFileSync(sentinel, "utf8"), "fixture");
});

test("legacy synchronous removal preserves literal path behavior", (t) => {
  const { first, second, sentinel } = fixture(t);
  assert.equal(rimrafSync(first), true);
  assert.equal(existsSync(first), false);
  assert.equal(existsSync(second), true);
  assert.equal(readFileSync(sentinel, "utf8"), "fixture");
});

test("legacy asynchronous glob removal uses the upgraded named API without deleting siblings", async (t) => {
  const { directory, first, second, sentinel } = fixture(t);
  const pattern = join(directory, "remove-*.txt").split(sep).join("/");
  assert.equal(await rimraf(pattern, { glob: { dot: true } }), true);
  assert.equal(existsSync(first), false);
  assert.equal(existsSync(second), false);
  assert.equal(readFileSync(sentinel, "utf8"), "fixture");
});

test("legacy synchronous glob removal uses the upgraded named API without deleting siblings", (t) => {
  const { directory, first, second, sentinel } = fixture(t);
  const pattern = join(directory, "remove-*.txt").split(sep).join("/");
  assert.equal(rimrafSync(pattern, { glob: { dot: true } }), true);
  assert.equal(existsSync(first), false);
  assert.equal(existsSync(second), false);
  assert.equal(readFileSync(sentinel, "utf8"), "fixture");
});
