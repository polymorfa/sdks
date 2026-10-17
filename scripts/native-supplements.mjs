// Checks contracts/native-campaign-supplements.json: every mapped operation and
// field exists in its pinned supplement, and every language names a public
// method or identifier that its package source and wire test actually contain.
// Attribution only: native CI must still execute the tests.
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { isAbsolute, join, relative, resolve } from "node:path";

export const NATIVE_SUPPLEMENT_LANGUAGES = [
  "typescript",
  "go",
  "python",
  "php",
  "rust",
  "dotnet",
];
const SOURCE_ROOTS = {
  typescript: ["src"],
  go: ["."],
  python: ["src"],
  php: ["src"],
  rust: ["src"],
  dotnet: ["src"],
};
const EXTENSIONS = {
  typescript: ".ts",
  go: ".go",
  python: ".py",
  php: ".php",
  rust: ".rs",
  dotnet: ".cs",
};

function sources(dir, extension, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name === "vendor" || name === "target")
      continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) sources(path, extension, out);
    else if (path.endsWith(extension) && !path.endsWith("_test.go"))
      out.push(readFileSync(path, "utf8"));
  }
  return out;
}
// The final identifier of a mapped method, for example GetFrequencyCapAsync.
export function methodToken(sdkMethod) {
  const token = sdkMethod
    .split(/[.:()]+/)
    .filter(Boolean)
    .at(-1);
  assert.ok(token && /^[A-Za-z_][A-Za-z0-9_]*$/.test(token), sdkMethod);
  return token;
}
function inside(root, file) {
  const local = relative(root, resolve(root, file));
  return local && !local.startsWith("..") && !isAbsolute(local);
}

export function checkNativeSupplements(root, inventory) {
  assert.equal(inventory.schemaVersion, 1);
  assert.match(
    inventory.implementationReference.typescriptCommit,
    /^[a-f0-9]{40}$/,
  );
  assert.equal(inventory.baselineLedger.operations, 579);
  const supplements = new Map();
  for (const entry of inventory.supplements) {
    const contract = JSON.parse(readFileSync(resolve(root, entry.path)));
    assert.equal(contract.commit, entry.commit, `${entry.path} commit drifted`);
    for (const [family, hash] of Object.entries(entry.sources))
      assert.equal(
        contract.sources[family]?.sourceSha256,
        hash,
        `${entry.path} ${family} hash drifted`,
      );
    supplements.set(entry.path, contract);
  }
  const corpus = new Map();
  const corpusFor = (language) => {
    if (!corpus.has(language)) {
      const packageRoot = resolve(root, "packages", language);
      corpus.set(
        language,
        SOURCE_ROOTS[language]
          .flatMap((dir) =>
            sources(resolve(packageRoot, dir), EXTENSIONS[language]),
          )
          .join("\n"),
      );
    }
    return corpus.get(language);
  };
  const keys = new Set();
  for (const operation of inventory.operations) {
    const key = `${operation.family}|${operation.method}|${operation.path}`;
    assert.ok(!keys.has(key), `duplicate supplement operation ${key}`);
    keys.add(key);
    const contract = supplements.get(operation.supplement);
    assert.ok(contract, `unknown supplement ${operation.supplement}`);
    const pinned =
      contract.sources[operation.family]?.paths?.[operation.path]?.[
        operation.method.toLowerCase()
      ];
    assert.ok(pinned, `${key} is not in ${operation.supplement}`);
    assert.equal(
      pinned.operationId,
      operation.operationId,
      `${key} operationId differs`,
    );
    assert.deepEqual(
      Object.keys(operation.languages).sort(),
      [...NATIVE_SUPPLEMENT_LANGUAGES].sort(),
      `${key} must map every language`,
    );
    for (const [language, mapping] of Object.entries(operation.languages)) {
      assert.equal(
        mapping.status,
        "covered",
        `${language} ${key} must be covered or removed from this inventory`,
      );
      const packageRoot = resolve(root, "packages", language);
      assert.ok(
        inside(packageRoot, mapping.testFile),
        "Wire evidence must stay inside the package",
      );
      const test = resolve(packageRoot, mapping.testFile);
      assert.ok(
        existsSync(test),
        `${language} wire test does not exist: ${mapping.testFile}`,
      );
      const token = methodToken(mapping.sdkMethod);
      assert.ok(
        readFileSync(test, "utf8").includes(token),
        `${language} test does not call ${token}`,
      );
      assert.ok(
        corpusFor(language).includes(token),
        `${language} source lacks ${token}`,
      );
      if (language === "typescript") continue;
      const manifest = JSON.parse(
        readFileSync(resolve(packageRoot, "supplements.json")),
      );
      const recorded = manifest.operations.find(
        (entry) =>
          entry.operationId === operation.operationId &&
          entry.contract === operation.supplement,
      );
      assert.ok(
        recorded,
        `${language} supplements.json lacks ${operation.operationId}`,
      );
      assert.equal(
        recorded.sdkMethod,
        mapping.sdkMethod,
        `${language} supplements.json method differs`,
      );
      assert.equal(
        recorded.testFile,
        mapping.testFile,
        `${language} supplements.json test differs`,
      );
      assert.equal(
        recorded.sourceSdkCommit,
        inventory.implementationReference.typescriptCommit,
      );
    }
  }
  for (const field of inventory.fields) {
    const source = supplements.get(field.supplement)?.sources?.[field.family];
    assert.ok(
      source,
      `unknown supplement source ${field.supplement} ${field.family}`,
    );
    assert.ok(
      field.contractName in source.fields ||
        field.contractName in source.schemas,
      `${field.contractName} is not in ${field.supplement} ${field.family}`,
    );
    assert.deepEqual(
      Object.keys(field.native).sort(),
      NATIVE_SUPPLEMENT_LANGUAGES.filter((l) => l !== "typescript").sort(),
    );
    for (const [language, name] of Object.entries(field.native))
      assert.ok(
        corpusFor(language).includes(name),
        `${language} source lacks ${name} for ${field.contractName}`,
      );
  }
  return {
    operations: inventory.operations.length,
    fields: inventory.fields.length,
  };
}
