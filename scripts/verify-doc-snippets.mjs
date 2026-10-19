import { spawnSync } from "node:child_process";
import {
  copyFileSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  writeFileSync,
} from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  generate,
  readJSON,
  root,
  serialize,
  substitute,
  validateCatalog,
} from "./doc-snippets/catalog.mjs";
import { languages } from "./doc-snippets/recipes.mjs";

function run(command, args, cwd, env = {}) {
  const result = spawnSync(command, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    maxBuffer: 16 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(
      `${command} ${args.join(" ")} failed (${result.status})\n${result.stdout}\n${result.stderr}`,
    );
  return result.stdout;
}
const json = (path, data) =>
  writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`);

export async function verify(language, { negativeTest = false } = {}) {
  if (!languages.includes(language))
    throw new Error(`Choose ${languages.join(", ")}`);
  const catalog = validateCatalog(readJSON("contracts/doc-snippets.json"));
  if (serialize(catalog) !== serialize(await generate()))
    throw new Error("Exported catalog drifted from recipes");
  const scratch = resolve(
    homedir(),
    ".polymorfa-agent-work/sdk-doc-snippets-20261019/checks",
  );
  mkdirSync(scratch, { recursive: true, mode: 0o700 });
  const work = mkdtempSync(join(scratch, `${language}-`));
  const entries = Object.entries(catalog.operations).filter(
    ([, entry]) => entry[language],
  );
  if (!entries.length) throw new Error(`${language} has no snippets to check`);
  const files = [];
  let check;
  if (language === "typescript") {
    run("npm", ["run", "build", "-w", "@polymorfa/sdk"], root);
    const pack = JSON.parse(
      run(
        "npm",
        ["pack", "--json", "--ignore-scripts", "--pack-destination", work],
        join(root, "packages/typescript"),
      ),
    )[0];
    json(join(work, "package.json"), { private: true, type: "module" });
    run(
      "npm",
      [
        "install",
        "--ignore-scripts",
        "--no-audit",
        "--no-fund",
        "--no-package-lock",
        join(work, pack.filename),
        "@types/node@^24",
      ],
      work,
    );
    json(join(work, "tsconfig.json"), {
      compilerOptions: {
        strict: true,
        target: "ES2022",
        module: "NodeNext",
        moduleResolution: "NodeNext",
        noEmit: true,
        types: ["node"],
      },
      include: ["*.ts"],
    });
    for (const [id, entry] of entries) {
      const file = join(work, `${id}.ts`);
      writeFileSync(file, substitute(entry[language].code));
      files.push(file);
    }
    check = () =>
      run(
        process.execPath,
        [
          join(root, "node_modules/typescript/bin/tsc"),
          "-p",
          join(work, "tsconfig.json"),
        ],
        work,
      );
  } else if (language === "go") {
    // A source module has no installable package archive. Extract the exact
    // source commit into a separate module, with workspace resolution disabled.
    const archive = join(work, "go-source.tar");
    run(
      "git",
      [
        "archive",
        "--format=tar",
        `--output=${archive}`,
        catalog.sourceCommit,
        "packages/go",
      ],
      root,
    );
    run("tar", ["-xf", archive, "-C", work], work);
    writeFileSync(
      join(work, "go.mod"),
      `module doc-snippets\n\ngo 1.24.0\n\nrequire github.com/polymorfa/sdks/packages/go v0.0.0\nreplace github.com/polymorfa/sdks/packages/go => ./packages/go\n`,
    );
    for (const [id, entry] of entries) {
      const dir = join(work, id);
      mkdirSync(dir);
      const file = join(dir, "main.go");
      writeFileSync(file, substitute(entry[language].code));
      files.push(file);
    }
    run("go", ["mod", "tidy"], work, { GOWORK: "off" });
    check = () => run("go", ["vet", "./..."], work, { GOWORK: "off" });
  } else if (language === "python") {
    run(
      "uv",
      ["build", "--wheel", "--out-dir", work, join(root, "packages/python")],
      work,
    );
    const wheel = readdirSync(work).find((p) => p.endsWith(".whl"));
    if (!wheel) throw new Error("Python wheel missing");
    run(
      "uv",
      [
        "venv",
        "--python",
        process.env.SDK_PYTHON_VERSION || "3.10",
        join(work, ".venv"),
      ],
      work,
    );
    const python = join(work, ".venv/bin/python");
    run(
      "uv",
      ["pip", "install", "--python", python, join(work, wheel), "mypy>=1.15"],
      work,
    );
    for (const [id, entry] of entries) {
      const file = join(work, `${id}.py`);
      writeFileSync(file, substitute(entry[language].code));
      files.push(file);
    }
    check = () =>
      run(
        python,
        ["-m", "mypy", "--strict", "--no-incremental", ...files],
        work,
      );
  } else if (language === "php") {
    run("php", ["tools/build.php"], join(root, "packages/php"), {
      POLYMORFA_BUILD_DIR: work,
    });
    const packed = join(work, "package");
    mkdirSync(packed);
    run("tar", ["-xf", join(work, "polymorfa-sdk.tar"), "-C", packed], work);
    json(join(work, "composer.json"), {
      name: "polymorfa/doc-snippet-check",
      description: "Local archive consumer",
      license: "MIT",
      repositories: [
        {
          type: "path",
          url: packed,
          options: {
            symlink: false,
            versions: { "polymorfa/sdk": "dev-doc-snippets" },
          },
        },
      ],
      require: { "polymorfa/sdk": "dev-doc-snippets" },
      "require-dev": { "phpstan/phpstan": "^2.1" },
    });
    run("composer", ["install", "--prefer-dist", "--no-interaction"], work);
    for (const [id, entry] of entries) {
      const file = join(work, `${id}.php`);
      writeFileSync(file, substitute(entry[language].code));
      files.push(file);
    }
    writeFileSync(
      join(work, "phpstan.neon"),
      `parameters:\n    level: max\n    paths:\n${files.map((f) => `        - ${f}`).join("\n")}\n`,
    );
    check = () => {
      for (const file of files) run("php", ["-l", file], work);
      return run(
        "php",
        [
          join(work, "vendor/bin/phpstan"),
          "analyse",
          "--configuration",
          join(work, "phpstan.neon"),
          "--no-progress",
          "--memory-limit=512M",
        ],
        work,
      );
    };
  } else if (language === "dotnet") {
    const version = catalog.packages.dotnet.version;
    run(
      "dotnet",
      [
        "pack",
        join(root, "packages/dotnet/src/Polymorfa.Sdk/Polymorfa.Sdk.csproj"),
        "-c",
        "Release",
        "-o",
        join(work, "feed"),
        "--nologo",
      ],
      work,
    );
    writeFileSync(
      join(work, "NuGet.Config"),
      `<configuration><packageSources><clear/><add key="local" value="${join(work, "feed")}"/></packageSources><config><add key="globalPackagesFolder" value="${join(work, "nuget")}"/></config></configuration>\n`,
    );
    const projects = [];
    for (const [id, entry] of entries) {
      const dir = join(work, id);
      mkdirSync(dir);
      const file = join(dir, "Program.cs");
      writeFileSync(file, substitute(entry[language].code));
      files.push(file);
      const project = join(dir, `${id}.csproj`);
      projects.push(project);
      writeFileSync(
        project,
        `<Project Sdk="Microsoft.NET.Sdk"><PropertyGroup><OutputType>Exe</OutputType><TargetFramework>net8.0</TargetFramework><Nullable>enable</Nullable><TreatWarningsAsErrors>true</TreatWarningsAsErrors></PropertyGroup><ItemGroup><PackageReference Include="Polymorfa.Sdk" Version="${version}"/></ItemGroup></Project>\n`,
      );
    }
    // One invocation compiles independent complete top-level programs.
    writeFileSync(
      join(work, "Snippets.proj"),
      `<Project><ItemGroup>${projects.map((p) => `<Snippet Include="${p}"/>`).join("")}</ItemGroup><Target Name="Build"><MSBuild Projects="@(Snippet)" Targets="Restore;Build" BuildInParallel="false"/></Target></Project>\n`,
    );
    check = () =>
      run(
        "dotnet",
        ["build", "Snippets.proj", "--nologo", "--warnaserror"],
        work,
        { DOTNET_ROLL_FORWARD: "Major" },
      );
  } else {
    const target = join(work, "packed");
    run(
      "cargo",
      [
        "package",
        "--manifest-path",
        join(root, "packages/rust/storage-core/Cargo.toml"),
        "--target-dir",
        target,
        "--allow-dirty",
      ],
      work,
    );
    const version = catalog.packages.rust.version;
    const core = join(target, "package", `polymorfa-storage-core-${version}`);
    run(
      "cargo",
      [
        "package",
        "--manifest-path",
        join(root, "packages/rust/Cargo.toml"),
        "--target-dir",
        target,
        "--allow-dirty",
        "--config",
        `patch.crates-io.polymorfa-storage-core.path=${JSON.stringify(core)}`,
      ],
      work,
    );
    const pkg = join(target, "package", `polymorfa-sdk-${version}`);
    writeFileSync(
      join(work, "Cargo.toml"),
      `[package]\nname = "doc-snippets"\nversion = "0.0.0"\nedition = "2021"\n[dependencies]\npolymorfa-sdk = { path = ${JSON.stringify(pkg)} }\ntokio = { version = "1", features = ["rt", "macros"] }\n[patch.crates-io]\npolymorfa-storage-core = { path = ${JSON.stringify(core)} }\n`,
    );
    const bins = join(work, "src/bin");
    mkdirSync(bins, { recursive: true });
    for (const [id, entry] of entries) {
      const file = join(bins, `${id}.rs`);
      writeFileSync(file, substitute(entry[language].code));
      files.push(file);
    }
    run("cargo", ["generate-lockfile"], work);
    check = () => run("cargo", ["check", "--locked", "--bins"], work);
  }
  process.stdout.write(check());
  console.log(
    `${language}: checked ${entries.length} exported programs against ${catalog.sourceCommit}; artifacts ${work}`,
  );
  if (negativeTest) {
    const index = entries.findIndex(([id]) => id === "sendMessage");
    if (index < 0)
      throw new Error("Compiler-negative test requires the sendMessage recipe");
    const file = files[index],
      original = readFileSync(file, "utf8");
    const bad = original.replace(
      language === "dotnet"
        ? "SendAsync("
        : language === "go"
          ? "Send("
          : "send(",
      "missingSnippetMethod(",
    );
    if (bad === original)
      throw new Error("Compiler-negative mutation missed public call");
    writeFileSync(file, bad);
    let rejected = false;
    try {
      check();
    } catch (error) {
      const message = String(error);
      if (!message.includes("missingSnippetMethod")) throw error;
      rejected = true;
      console.log(
        `${language}: real checker rejected nonexistent public method`,
      );
    } finally {
      writeFileSync(file, original);
    }
    if (!rejected)
      throw new Error(`${language}: checker accepted invalid exported call`);
  }
  return { language, count: entries.length, work };
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
)
  await verify(process.argv[2], {
    negativeTest: process.argv.includes("--negative-test"),
  });
