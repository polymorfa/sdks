import { spawnSync } from "node:child_process";
import { existsSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { mkdirSync } from "node:fs";
import { homedir } from "node:os";

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
  run("node", [resolve(root, "examples/go/web-host/build-assets.mjs")]);
  const host = resolve(root, "examples/go/web-host");
  for (const args of [
    ["test", "-race", "./..."],
    ["build", "./..."],
  ]) {
    const result = spawnSync("go", args, {
      cwd: host,
      stdio: "inherit",
      env: process.env,
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error("Go framework host verification failed");
  }
} else if (language === "python") {
  run("node", [resolve(root, "examples/python/web_host/build-assets.mjs")]);
  const python = process.env.SDK_PYTHON_VERSION;
  const uv = [...(python ? ["--python", python] : []), "--extra", "test"];
  for (const args of [
    ["ruff", "check", "."],
    ["ruff", "format", "--check", "."],
    ["mypy", "--no-incremental", "src/polymorfa"],
    ["pytest"],
    ["python", "-m", "build"],
  ])
    run("uv", ["run", ...uv, ...args]);
} else if (language === "php") {
  run("composer", ["validate", "--strict"]);
  run("composer", ["install", "--prefer-dist", "--no-interaction"]);
  for (const script of ["lint", "typecheck", "test", "build"])
    run("composer", [script]);
  const host = resolve(root, "examples/php/web-host");
  const state = resolve(
    homedir(),
    ".polymorfa-agent-work/php-sdk-framework-checks",
  );
  mkdirSync(state, { recursive: true, mode: 0o700 });
  for (const [command, args] of [
    ["composer", ["install", "--prefer-dist", "--no-interaction"]],
    ["node", ["build-assets.mjs"]],
    ["php", ["tests/run.php"]],
  ]) {
    const result = spawnSync(command, args, {
      cwd: host,
      stdio: "inherit",
      env: { ...process.env, EXAMPLE_STATE_DIR: state },
    });
    if (result.error) throw result.error;
    if (result.status !== 0)
      throw new Error("PHP framework host verification failed");
  }
} else if (language === "rust") {
  run("node", [resolve(root, "examples/rust/yew/build-elements.mjs")]);
  for (const [manifest, target] of [
    ["examples/rust/axum/Cargo.toml", undefined],
    ["examples/rust/yew/frontend/Cargo.toml", "wasm32-unknown-unknown"],
  ]) {
    run("cargo", [
      "check",
      "--manifest-path",
      resolve(root, manifest),
      ...(target ? ["--target", target] : []),
    ]);
  }
  run("cargo", [
    "test",
    "--manifest-path",
    resolve(root, "examples/rust/yew/server/Cargo.toml"),
  ]);
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
  const coreManifest = resolve(cwd, "storage-core/Cargo.toml");
  run("cargo", ["fmt", "--manifest-path", coreManifest, "--check"]);
  run("cargo", [
    "clippy",
    "--manifest-path",
    coreManifest,
    "--all-targets",
    "--",
    "-D",
    "warnings",
  ]);
  run("cargo", ["test", "--manifest-path", coreManifest, "--locked"]);
  const metadata = JSON.parse(
    run(
      "cargo",
      [
        "metadata",
        "--manifest-path",
        coreManifest,
        "--format-version",
        "1",
        "--no-deps",
        "--locked",
      ],
      { capture: true },
    ),
  );
  const core = metadata.packages.find(
    (pkg) => pkg.name === "polymorfa-storage-core",
  );
  if (!core) throw new Error("Missing portable Rust storage package");
  const target = resolve(cwd, "target");
  run("cargo", [
    "package",
    "--manifest-path",
    coreManifest,
    "--target-dir",
    target,
    "--allow-dirty",
  ]);
  // Cargo 1.85 cannot stage unpublished interdependent crates itself. Verify
  // against the extracted, verified core archive, never the workspace source.
  // Release preparation must repeat unpatched registry verification after the
  // core is published under the release's separate authority.
  const packedCore = resolve(target, "package", `${core.name}-${core.version}`);
  run("cargo", [
    "package",
    "--target-dir",
    target,
    "--allow-dirty",
    "--config",
    `patch.crates-io.polymorfa-storage-core.path=${JSON.stringify(packedCore)}`,
  ]);
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
  for (const example of [
    "aspnet-core/Polymorfa.Example.AspNet.csproj",
    "calls-agent/Polymorfa.Example.Calls.csproj",
    "blazor-components/Polymorfa.Example.Components.csproj",
    "blazor-wasm/Polymorfa.Example.Blazor.csproj",
  ])
    run("dotnet", [
      "build",
      `examples/${example}`,
      "--configuration",
      "Release",
      "--warnaserror",
    ]);
  run("node", ["examples/build-elements.mjs"]);
  run("dotnet", [
    "publish",
    "examples/blazor-wasm/Polymorfa.Example.Blazor.csproj",
    "--configuration",
    "Release",
    "--output",
    "examples/blazor-wasm/bin/served",
    "--warnaserror",
  ]);
  run("node", ["examples/prepare-blazor.mjs"]);
  run("node", ["--test", "examples/maui/bridge-tests/native-bridge.test.mjs"]);
  run("dotnet", [
    "run",
    "--project",
    "examples/maui/bridge-tests/Polymorfa.Example.Maui.Bridge.Tests.csproj",
    "--configuration",
    "Release",
  ]);
  run("dotnet", [
    "run",
    "--project",
    "tests/Polymorfa.Sdk.Tests/Polymorfa.Sdk.Tests.csproj",
    "--configuration",
    "Release",
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
