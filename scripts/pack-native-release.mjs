import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
const language = process.argv[2];
const commands = {
  go: ["go", ["build", "./..."]],
  python: [
    "uv",
    ["run", "--python", "3.10", "--extra", "test", "python", "-m", "build"],
  ],
  php: ["composer", ["build"]],
  rust: ["cargo", ["package", "--allow-dirty"]],
  dotnet: [
    "dotnet",
    [
      "pack",
      "src/Polymorfa.Sdk/Polymorfa.Sdk.csproj",
      "--configuration",
      "Release",
      "--output",
      "artifacts",
      "--warnaserror",
    ],
  ],
};
assert.ok(Object.hasOwn(commands, language));
const [command, args] = commands[language];
const result = spawnSync(command, args, {
  cwd: resolve(import.meta.dirname, "../packages", language),
  stdio: "inherit",
  env: process.env,
});
if (result.error) throw result.error;
assert.equal(result.status, 0, `Release package build failed for ${language}`);
