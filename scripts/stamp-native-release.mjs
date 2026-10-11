import assert from "node:assert/strict";
import { readFileSync, writeFileSync, copyFileSync } from "node:fs";
import { join, resolve } from "node:path";
const root = resolve(import.meta.dirname, "..");
const language = process.argv[2];
assert.ok(["go", "python", "php", "dotnet", "rust"].includes(language));
const receiptPath = resolve(
  process.env.RELEASE_OUTPUT ?? join(root, ".release/native"),
  "release-contract.json",
);
const provenance = JSON.parse(readFileSync(receiptPath));
assert.equal(provenance.repository, "polymorfa/sdks");
const version = provenance.versions.semver;
assert.match(version, /^\d+\.\d+\.\d+(?:-dev\.\d{14})?$/);
const pkg = join(root, "packages", language);
function replace(file, pattern, replacement) {
  const path = join(pkg, file);
  const text = readFileSync(path, "utf8");
  assert.ok(pattern.test(text), `Missing version field in ${file}`);
  writeFileSync(path, text.replace(pattern, replacement));
}
copyFileSync(receiptPath, join(pkg, "release-contract.json"));
if (language === "go") {
  replace(
    "transport.go",
    /const Version = "[^"]+"/,
    `const Version = "${version}"`,
  );
  replace("calls_diagnostics.go", /Version: "[^"]+"/, "Version: Version");
} else if (language === "python") {
  const pep440 = provenance.versions.python;
  assert.match(pep440, /^\d+\.\d+\.\d+(?:\.dev\d{14})?$/);
  replace("pyproject.toml", /^version = "[^"]+"/m, `version = "${pep440}"`);
  replace(
    "src/polymorfa/transport.py",
    /SDK_VERSION = "[^"]+"/,
    `SDK_VERSION = "${pep440}"`,
  );
  copyFileSync(receiptPath, join(pkg, "src/polymorfa/release-contract.json"));
} else if (language === "php") {
  replace(
    "src/HttpTransport.php",
    /SDK_VERSION = '[^']+'/,
    `SDK_VERSION = '${version}'`,
  );
} else if (language === "rust") {
  replace("Cargo.toml", /^version = "[^"]+"/m, `version = "${version}"`);
} else {
  replace(
    "src/Polymorfa.Sdk/Polymorfa.Sdk.csproj",
    /<Version>[^<]+<\/Version>/,
    `<Version>${version}</Version>`,
  );
  replace(
    "src/Polymorfa.Sdk/Configuration.cs",
    /const string Version = "[^"]+"/,
    `const string Version = "${version}"`,
  );
}
console.log(
  `Stamped ${language} release source with accepted provenance. No publication occurred.`,
);
