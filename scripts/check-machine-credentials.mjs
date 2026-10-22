import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
const root = new URL("../", import.meta.url);
const read = (path) => readFileSync(new URL(path, root));
const source = JSON.parse(read("contracts/machine-credentials.source.json"));
assert.equal(source.commit, "e95d02da674da8242453c2a41efd48883fa04734");
assert.equal(source.blob, "a40eb08683ff5f6eae62b821992fa1431df9a5db");
const bytes = read("contracts/machine-credentials.v1.json");
assert.equal(bytes.length, source.bytes);
assert.equal(createHash("sha256").update(bytes).digest("hex"), source.sha256);
assert.equal(
  createHash("sha1")
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest("hex"),
  source.blob,
);
for (const path of [
  "packages/typescript/test/support/credentials.ts",
  "packages/go/credential_opaque_test.go",
  "packages/python/tests/test_credential_opaque.py",
  "packages/php/tests/credential_opaque.php",
  "packages/rust/tests/credential_opaque.rs",
  "packages/dotnet/tests/Polymorfa.Sdk.Tests/Polymorfa.Sdk.Tests.csproj",
]) {
  assert.match(
    read(path).toString(),
    /machine-credentials\.v1\.json/,
    `${path} must consume the shared fixture`,
  );
}
console.log(
  "Shared API647 fixture provenance and six-language consumers verified.",
);
