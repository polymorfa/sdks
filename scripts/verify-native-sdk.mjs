import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const language = process.argv[2];
if (!["go", "python", "php", "dotnet", "rust"].includes(language))
  throw new Error("Choose go, python, php, dotnet or rust");
const root = resolve(import.meta.dirname, "..");
const cwd = resolve(root, "packages", language);
function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    stdio: options.capture ? "pipe" : "inherit",
    env: process.env,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
  return result.stdout;
}
if (language === "go") {
  const files = readdirSync(cwd).filter((file) => file.endsWith(".go"));
  if (run("gofmt", ["-l", ...files], { capture: true }).trim())
    throw new Error("Run gofmt before committing");
  run("go", ["vet", "./..."]);
  run("go", ["test", "-race", "./..."]);
  run("go", ["build", "./..."]);
} else if (language === "python") {
  const python = process.env.SDK_PYTHON_VERSION;
  const uv = [...(python ? ["--python", python] : []), "--extra", "test"];
  for (const args of [
    ["ruff", "check", "."],
    ["ruff", "format", "--check", "."],
    ["mypy", "src/polymorfa"],
    ["pytest"],
    ["python", "-m", "build"],
  ])
    run("uv", ["run", ...uv, ...args]);
} else if (language === "php") {
  run("composer", ["validate", "--strict"]);
  run("composer", ["install", "--prefer-dist", "--no-interaction"]);
  for (const script of ["lint", "typecheck", "test", "build"])
    run("composer", [script]);
} else if (language === "rust") {
  run("cargo", ["fmt", "--check"]);
  run("cargo", [
    "clippy",
    "--all-targets",
    "--all-features",
    "--",
    "-D",
    "warnings",
  ]);
  run("cargo", ["test", "--all-features"]);
  run("cargo", ["package", "--allow-dirty"]);
} else {
  const project = "src/Polymorfa.Sdk/Polymorfa.Sdk.csproj";
  if (!existsSync(resolve(cwd, project)))
    throw new Error("Missing .NET SDK project");
  run("dotnet", ["format", project, "--verify-no-changes"]);
  run("dotnet", [
    "build",
    project,
    "--configuration",
    "Release",
    "--warnaserror",
  ]);
  run("dotnet", [
    "run",
    "--project",
    "tests/Polymorfa.Sdk.Tests/Polymorfa.Sdk.Tests.csproj",
    "--configuration",
    "Release",
  ]);
  for (const example of [
    "aspnet-core/Polymorfa.Example.AspNet.csproj",
    "calls-agent/Polymorfa.Example.Calls.csproj",
    "blazor-components/Polymorfa.Example.Components.csproj",
  ])
    run("dotnet", [
      "build",
      `examples/${example}`,
      "--configuration",
      "Release",
      "--warnaserror",
    ]);
  run("dotnet", [
    "pack",
    project,
    "--configuration",
    "Release",
    "--output",
    "artifacts",
  ]);
}
