import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { copyFileSync, mkdirSync, readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
const language = process.argv[2];
assert.ok(["go", "python", "php", "rust", "dotnet"].includes(language));
const root = resolve(import.meta.dirname, "..");
const receipt = resolve(
  process.env.RELEASE_OUTPUT ?? join(root, ".release/native"),
  "release-contract.json",
);
const provenance = JSON.parse(readFileSync(receipt));
assert.equal(provenance.repository, "polymorfa/sdks");
const version = provenance.versions.semver;
assert.match(version, /^\d+\.\d+\.\d+(?:-dev\.\d{14})?$/);
const pkg = join(root, "packages", language);
assert.deepEqual(
  JSON.parse(readFileSync(join(pkg, "release-contract.json"))),
  provenance,
);
const output = resolve(root, ".release/native/packs", language);
mkdirSync(output, { recursive: true, mode: 0o700 });
assert.equal(
  readdirSync(output).length,
  0,
  "Accepted artifact directory must be empty; preserve existing output and choose a fresh checkout",
);
function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { cwd: pkg, stdio: "inherit", env });
  if (result.error) throw result.error;
  assert.equal(
    result.status,
    0,
    `Release package build failed for ${language}`,
  );
}
if (language === "go") {
  run("go", ["build", "./..."]);
  run("tar", [
    "--exclude=.artifacts",
    "-cf",
    join(output, `polymorfa-go-${version}.tar`),
    ".",
  ]);
} else if (language === "python") {
  run("uv", [
    "run",
    "--python",
    "3.10",
    "--extra",
    "test",
    "python",
    "-m",
    "build",
    "--outdir",
    output,
  ]);
} else if (language === "php") {
  run("composer", ["build"], { ...process.env, POLYMORFA_BUILD_DIR: output });
} else if (language === "rust") {
  run("cargo", ["package", "--allow-dirty"]);
  copyFileSync(
    join(pkg, "target/package", `polymorfa-sdk-${version}.crate`),
    join(output, `polymorfa-sdk-${version}.crate`),
  );
} else {
  run("dotnet", [
    "pack",
    "src/Polymorfa.Sdk/Polymorfa.Sdk.csproj",
    "--configuration",
    "Release",
    `-p:PackageOutputPath=${output}`,
    "-p:TreatWarningsAsErrors=true",
  ]);
}
run("python3", [
  join(root, "scripts/inspect-native-artifacts.py"),
  language,
  output,
  receipt,
]);
copyFileSync(receipt, join(output, "release-contract.json"));
console.log(
  `Prepared only accepted ${language} artifacts in ${output}. No publication occurred.`,
);
