// Attribution only: native CI must execute the referenced wire tests.
import assert from "node:assert/strict";
import { Buffer } from "node:buffer";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const languages = ["typescript", "go", "python", "php", "rust", "dotnet"];
const filters = ["tag", "phonePrefix"];
const root = fileURLToPath(new URL("..", import.meta.url));

function readInside(directory, path) {
  assert.equal(typeof path, "string");
  const local = relative(directory, resolve(directory, path));
  assert.ok(
    local && !local.startsWith("..") && !isAbsolute(local),
    "Coverage evidence must stay inside its root",
  );
  return readFileSync(resolve(directory, path), "utf8");
}
function identifier(value) {
  assert.match(value, /^[A-Za-z_][A-Za-z0-9_]*$/);
  return new RegExp("\\b" + value + "\\b");
}
export function checkAudienceProfileFilterCoverage(
  directory = root,
  inventory,
) {
  inventory ??= JSON.parse(
    readInside(directory, "contracts/audience-profile-filter-coverage.json"),
  );
  assert.equal(inventory.schemaVersion, 1);
  assert.equal(inventory.principal, "organization");
  assert.match(inventory.sourceSdkCommit, /^[a-f0-9]{40}$/);
  assert.equal(inventory.contract.path, "contracts/audience-profiles.json");
  const contractText = readInside(directory, inventory.contract.path);
  const blob = createHash("sha1")
    .update("blob " + Buffer.byteLength(contractText) + "\0")
    .update(contractText)
    .digest("hex");
  assert.equal(
    blob,
    inventory.contract.blobSha1,
    "Pinned profile supplement content drifted",
  );
  const contract = JSON.parse(contractText);
  for (const key of ["repository", "commit", "sourcePath", "sourceSha256"])
    assert.equal(
      contract[key],
      inventory.contract[key],
      "Profile supplement " + key + " drifted",
    );
  assert.equal(contract.repository, "polymorfa/polymorfa");
  assert.equal(contract.sourcePath, "apps/api/docs/openapi.management.json");
  assert.equal(inventory.operation.operationId, "listAudienceProfiles");
  assert.equal(inventory.operation.method, "GET");
  assert.equal(inventory.operation.path, "/platform/audience-profiles");
  const operation = contract.paths[inventory.operation.path]?.get;
  assert.equal(operation?.operationId, inventory.operation.operationId);
  assert.equal(operation["x-polymorfa-resource-boundary"], "organization");
  assert.deepEqual(inventory.queryParameters, ["cursor", "limit", ...filters]);
  assert.deepEqual(
    operation.parameters.filter((p) => p.in === "query").map((p) => p.name),
    inventory.queryParameters,
    "Profile query parameters drifted",
  );
  assert.deepEqual(
    Object.keys(inventory.languages).sort(),
    [...languages].sort(),
    "Profile filters must map every SDK language",
  );
  for (const language of languages) {
    const mapping = inventory.languages[language];
    assert.equal(mapping.status, "covered");
    assert.equal(
      mapping.sdkMethod
        .split(/[.:()]+/)
        .filter(Boolean)
        .at(-1),
      mapping.method,
      "Mapped public method differs",
    );
    const packageRoot = resolve(directory, "packages", language);
    assert.ok(
      Array.isArray(mapping.sourceFiles) && mapping.sourceFiles.length > 0,
    );
    const source = mapping.sourceFiles
      .map((path) => readInside(packageRoot, path))
      .join("\n");
    assert.match(mapping.testFile, /(?:^|\/)tests?\/|_test\.go$/);
    const test = readInside(packageRoot, mapping.testFile);
    assert.match(source, identifier(mapping.method));
    assert.match(
      test,
      identifier(mapping.method),
      language + " wire test lacks the public method",
    );
    assert.deepEqual(
      Object.keys(mapping.parameters).sort(),
      [...filters].sort(),
    );
    for (const filter of filters) {
      assert.match(
        source,
        identifier(mapping.parameters[filter]),
        language + " source lacks " + filter,
      );
      assert.match(
        test,
        identifier(filter),
        language + " wire test lacks " + filter,
      );
    }
  }
  return {
    operations: 1,
    filters: filters.length,
    languages: languages.length,
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  console.log(JSON.stringify(checkAudienceProfileFilterCoverage()));
