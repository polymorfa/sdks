// Plans and performs native registry publication of accepted artifacts only.
//
// plan:    node scripts/native-publish.mjs plan <packs-root> <receipt> <out.json>
// publish: node scripts/native-publish.mjs publish <registry> <plan.json>
//
// The plan binds the receipt, version and every artifact hash. Publication
// re-checks that binding, never overwrites an existing registry version with
// different bytes, publishes dependencies first and stops dependents when a
// dependency is not confirmed. Credentials come from the environment only and
// are never written to arguments, files or logs. NATIVE_PUBLISH_DRY_RUN=1
// records intended effects without contacting a registry.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { nativePackages } from "./native-packages.mjs";

export const registries = {
  crates: "rust",
  nuget: "dotnet",
  pypi: "python",
  packagist: "php",
  go: "go",
};
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

export function validateReceipt(receipt) {
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.repository, "polymorfa/sdks");
  assert.match(receipt.sourceSha, /^[a-f0-9]{40}$/);
  assert.match(receipt.fingerprint, /^[a-f0-9]{64}$/);
  assert.ok(["nightly", "stable"].includes(receipt.channel));
  const { semver, python, goTag } = receipt.versions ?? {};
  assert.match(semver, /^\d+\.\d+\.\d+(?:-dev\.\d{14})?$/);
  assert.equal(
    semver.includes("-dev."),
    receipt.channel === "nightly",
    "Version does not match channel",
  );
  assert.equal(python, semver.replace(/-dev\./, ".dev"));
  assert.equal(goTag, `packages/go/v${semver}`);
  assert.ok(
    receipt.acceptance && typeof receipt.acceptance === "object",
    "Acceptance is required",
  );
  return receipt;
}

function artifactName(language, name, versions) {
  if (language === "rust") return `${name}-${versions.semver}.crate`;
  if (language === "dotnet") return `${name}.${versions.semver}.nupkg`;
  if (language === "go") return `polymorfa-go-${versions.semver}.tar`;
  return null;
}

// Builds the ordered publication plan from inspected accepted pack directories.
export function planNativeRelease(packsRoot, receipt) {
  validateReceipt(receipt);
  const steps = [];
  for (const [registry, language] of Object.entries(registries)) {
    const dir = join(packsRoot, language);
    const loose = JSON.parse(readFileSync(join(dir, "release-contract.json")));
    assert.deepEqual(
      loose,
      receipt,
      `${language} packs carry a different receipt`,
    );
    const files = readdirSync(dir)
      .filter((f) => f !== "release-contract.json")
      .sort();
    for (const pkg of nativePackages[language]) {
      let artifacts;
      if (language === "python")
        artifacts = files.filter((f) =>
          f.startsWith(`polymorfa_sdk-${receipt.versions.python}`),
        );
      else if (language === "php") artifacts = files;
      else artifacts = [artifactName(language, pkg.name, receipt.versions)];
      assert.ok(
        artifacts.length > 0 && artifacts.every((f) => files.includes(f)),
        `${pkg.name} artifact is missing`,
      );
      steps.push({
        id: `${registry}:${pkg.name}`,
        registry,
        package: pkg.name,
        version:
          language === "python"
            ? receipt.versions.python
            : registry === "go"
              ? receipt.versions.goTag
              : receipt.versions.semver,
        dependsOn: pkg.dependsOn.map((name) => `${registry}:${name}`),
        artifacts: artifacts.map((file) => ({
          file: `${language}/${file}`,
          sha256: sha256(readFileSync(join(dir, file))),
        })),
      });
    }
  }
  return {
    schemaVersion: 1,
    repository: receipt.repository,
    sourceSha: receipt.sourceSha,
    fingerprint: receipt.fingerprint,
    channel: receipt.channel,
    versions: receipt.versions,
    receiptSha256: sha256(JSON.stringify(receipt)),
    steps,
    publication: "not performed",
  };
}

// Re-checks the plan against the downloaded artifacts and receipt before any effect.
export function verifyPlan(plan, packsRoot, receipt) {
  validateReceipt(receipt);
  assert.equal(plan.schemaVersion, 1);
  assert.equal(
    plan.receiptSha256,
    sha256(JSON.stringify(receipt)),
    "Release receipt differs from the plan",
  );
  for (const key of ["sourceSha", "fingerprint", "channel"])
    assert.equal(plan[key], receipt[key], `Plan ${key} differs`);
  assert.deepEqual(plan.versions, receipt.versions);
  for (const step of plan.steps)
    for (const artifact of step.artifacts)
      assert.equal(
        sha256(readFileSync(join(packsRoot, artifact.file))),
        artifact.sha256,
        `${artifact.file} differs from the plan`,
      );
  return plan;
}

// Runs one registry's steps in dependency order. Each adapter returns
// existing() as "absent", "same" or "different"; publish() performs the upload
// and verify() must confirm the registry now serves the same bytes.
export async function executeSteps(
  steps,
  adapter,
  { dryRun = false, log = console.log } = {},
) {
  const done = new Set();
  const results = [];
  for (const step of steps) {
    const blocked = step.dependsOn.filter((id) => !done.has(id));
    if (blocked.length) {
      results.push({ id: step.id, state: "blocked", blockedBy: blocked });
      log(
        `${step.id}: not attempted; dependency ${blocked.join(", ")} is not confirmed`,
      );
      continue;
    }
    const before = await adapter.existing(step);
    if (before === "different")
      throw new Error(
        `${step.id} already exists with different contents; refusing to overwrite`,
      );
    if (before === "same") {
      done.add(step.id);
      results.push({ id: step.id, state: "already-published" });
      continue;
    }
    assert.equal(before, "absent", `${step.id} registry state is uncertain`);
    if (dryRun) {
      // Dependents of a planned publication are planned too, never effected.
      done.add(step.id);
      results.push({ id: step.id, state: "would-publish" });
      log(`${step.id}: dry run, would publish ${step.version}`);
      continue;
    }
    try {
      await adapter.publish(step);
    } catch (error) {
      // An upload error does not prove that nothing was stored. Re-read before
      // deciding; never retry blindly with possibly different bytes.
      const after = await adapter.existing(step).catch(() => "uncertain");
      if (after !== "same") {
        results.push({ id: step.id, state: "failed", registry: after });
        log(
          `${step.id}: publication failed (${error.message}); registry state ${after}`,
        );
        continue;
      }
    }
    assert.equal(
      await adapter.verify(step),
      true,
      `${step.id} could not be verified after publication`,
    );
    done.add(step.id);
    results.push({ id: step.id, state: "published" });
  }
  return results;
}

async function http(url, init = {}) {
  return fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
    ...init,
    headers: {
      "user-agent": "polymorfa-sdk-release (github.com/polymorfa/sdks)",
      ...(init.headers ?? {}),
    },
  });
}
function env(name) {
  const value = process.env[name];
  assert.ok(value, `${name} is required for this publisher`);
  return value;
}
function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  if (result.status !== 0)
    throw new Error(`${command} failed (${result.status})`);
}

// crates.io: the API reports each version's sha256 checksum of the .crate file.
export function cratesAdapter(
  packsRoot,
  base = process.env.CRATES_API_BASE ?? "https://crates.io",
  metadata = crateMetadata,
) {
  return {
    async existing(step) {
      const response = await http(
        `${base}/api/v1/crates/${step.package}/${step.version}`,
      );
      if (response.status === 404) return "absent";
      assert.equal(
        response.status,
        200,
        `crates.io lookup failed for ${step.id}`,
      );
      return (await response.json()).version?.checksum ===
        step.artifacts[0].sha256
        ? "same"
        : "different";
    },
    async publish(step) {
      // Upload the exact accepted .crate bytes through the registry publish API;
      // `cargo publish` would repack and could change them.
      const bytes = readFileSync(join(packsRoot, step.artifacts[0].file));
      const response = await http(`${base}/api/v1/crates/new`, {
        method: "PUT",
        headers: {
          authorization: env("CARGO_REGISTRY_TOKEN"),
          "content-type": "application/octet-stream",
        },
        body: crateUploadBody(bytes, metadata(packsRoot, step)),
      });
      assert.equal(
        response.status,
        200,
        `crates.io publish returned ${response.status}`,
      );
    },
    async verify(step) {
      for (let attempt = 0; attempt < 12; attempt++) {
        const state = await this.existing(step);
        if (state !== "absent") return state === "same";
        await new Promise((done) => setTimeout(done, 5000));
      }
      return false;
    },
  };
}

// Registry web API publish metadata derived from the packaged manifest.
export function crateMetadata(packsRoot, step) {
  const dir = join(packsRoot, "unpacked", step.package);
  run("mkdir", ["-p", dir]);
  run("tar", [
    "-xzf",
    join(packsRoot, step.artifacts[0].file),
    "-C",
    dir,
    "--strip-components=1",
  ]);
  const result = spawnSync(
    "cargo",
    [
      "metadata",
      "--manifest-path",
      join(dir, "Cargo.toml"),
      "--no-deps",
      "--format-version",
      "1",
      "--offline",
    ],
    { encoding: "utf8", maxBuffer: 16 * 1024 * 1024 },
  );
  assert.equal(result.status, 0, `cargo metadata failed for ${step.id}`);
  const pkg = JSON.parse(result.stdout).packages[0];
  assert.equal(pkg.name, step.package);
  assert.equal(pkg.version, step.version);
  const readme = pkg.readme
    ? readFileSync(join(dir, pkg.readme), "utf8")
    : null;
  return {
    name: pkg.name,
    vers: pkg.version,
    deps: pkg.dependencies.map((d) => ({
      name: d.name,
      version_req: d.req,
      features: d.features,
      optional: d.optional,
      default_features: d.uses_default_features,
      target: d.target,
      kind: d.kind ?? "normal",
      registry: d.registry,
      explicit_name_in_toml: d.rename,
    })),
    features: pkg.features,
    authors: pkg.authors,
    description: pkg.description,
    documentation: pkg.documentation,
    homepage: pkg.homepage,
    readme,
    readme_file: pkg.readme ? basename(pkg.readme) : null,
    keywords: pkg.keywords,
    categories: pkg.categories,
    license: pkg.license,
    license_file: pkg.license_file,
    repository: pkg.repository,
    badges: {},
    links: pkg.links,
    rust_version: pkg.rust_version,
  };
}
export function crateUploadBody(crate, metadata) {
  const json = Buffer.from(JSON.stringify(metadata));
  const length = (n) => {
    const b = Buffer.alloc(4);
    b.writeUInt32LE(n);
    return b;
  };
  return Buffer.concat([
    length(json.length),
    json,
    length(crate.length),
    crate,
  ]);
}

// nuget.org re-signs packages, so compare every entry except the repository signature.
function nupkgDigest(bytes) {
  const dir = join(
    process.env.RUNNER_TEMP ?? process.env.TMPDIR ?? ".",
    `nupkg-${sha256(bytes)}`,
  );
  run("mkdir", ["-p", dir]);
  const file = join(dir, "package.nupkg");
  writeFileSync(file, bytes);
  const listing = spawnSync("unzip", ["-Z1", file], { encoding: "utf8" })
    .stdout.split("\n")
    .filter((n) => n && !n.endsWith("/") && n !== ".signature.p7s")
    .sort();
  const digest = createHash("sha256");
  for (const name of listing)
    digest
      .update(name + "\0")
      .update(spawnSync("unzip", ["-p", file, name]).stdout)
      .update("\0");
  return digest.digest("hex");
}
export function nugetAdapter(
  packsRoot,
  base = process.env.NUGET_BASE ?? "https://api.nuget.org",
  push = process.env.NUGET_PUSH_URL ?? "https://www.nuget.org/api/v2/package",
) {
  return {
    async existing(step) {
      const id = step.package.toLowerCase();
      const version = step.version.toLowerCase();
      const response = await http(
        `${base}/v3-flatcontainer/${id}/${version}/${id}.${version}.nupkg`,
      );
      if (response.status === 404) return "absent";
      assert.equal(response.status, 200, `NuGet lookup failed for ${step.id}`);
      const remote = Buffer.from(await response.arrayBuffer());
      return nupkgDigest(remote) ===
        nupkgDigest(readFileSync(join(packsRoot, step.artifacts[0].file)))
        ? "same"
        : "different";
    },
    async publish(step) {
      // NuGet V2 push protocol; the key travels only in the X-NuGet-ApiKey header.
      const form = new FormData();
      form.append(
        "package",
        new Blob([readFileSync(join(packsRoot, step.artifacts[0].file))]),
        basename(step.artifacts[0].file),
      );
      const response = await http(push, {
        method: "PUT",
        headers: { "X-NuGet-ApiKey": env("NUGET_API_KEY") },
        body: form,
      });
      assert.ok(
        [200, 201, 202].includes(response.status),
        `NuGet push returned ${response.status}`,
      );
    },
    async verify(step) {
      for (let attempt = 0; attempt < 60; attempt++) {
        const state = await this.existing(step);
        if (state !== "absent") return state === "same";
        await new Promise((done) => setTimeout(done, 10_000));
      }
      return false;
    },
  };
}

// PyPI uploads run through pypa/gh-action-pypi-publish with trusted publishing.
// This adapter only reads the JSON API to refuse different existing files and
// to confirm the uploaded digests afterwards.
export function pypiAdapter(
  packsRoot,
  base = process.env.PYPI_BASE ?? "https://pypi.org",
) {
  return {
    async existing(step) {
      const response = await http(
        `${base}/pypi/${step.package}/${step.version}/json`,
      );
      if (response.status === 404) return "absent";
      assert.equal(response.status, 200, `PyPI lookup failed for ${step.id}`);
      const urls = new Map(
        (await response.json()).urls.map((u) => [u.filename, u.digests.sha256]),
      );
      const mine = step.artifacts.map((a) => [basename(a.file), a.sha256]);
      if (
        mine.some(([name, hash]) => urls.has(name) && urls.get(name) !== hash)
      )
        return "different";
      return mine.every(([name]) => urls.has(name)) ? "same" : "absent";
    },
    async publish() {
      throw new Error("PyPI uploads run through the trusted publishing action");
    },
    async verify(step) {
      return (await this.existing(step)) === "same";
    },
  };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, ...args] = process.argv.slice(2);
  if (command === "plan") {
    const [packsRoot, receiptPath, out] = args;
    const plan = planNativeRelease(
      resolve(packsRoot),
      JSON.parse(readFileSync(receiptPath)),
    );
    writeFileSync(out, JSON.stringify(plan, null, 2) + "\n", { mode: 0o600 });
    console.log(
      `Planned ${plan.steps.length} native publications for ${plan.versions.semver}. No publication occurred.`,
    );
  } else if (
    command === "publish" ||
    command === "check" ||
    command === "confirm"
  ) {
    const [registry, planPath] = args;
    assert.ok(Object.hasOwn(registries, registry), "Unknown registry");
    const packsRoot = resolve(
      process.env.RELEASE_PACKS ?? ".release/native/packs",
    );
    const receipt = JSON.parse(
      readFileSync(
        resolve(
          process.env.RELEASE_RECEIPT ??
            ".release/native/release-contract.json",
        ),
      ),
    );
    const plan = verifyPlan(
      JSON.parse(readFileSync(planPath)),
      packsRoot,
      receipt,
    );
    const steps = plan.steps.filter((step) => step.registry === registry);
    const adapter = {
      crates: cratesAdapter,
      nuget: nugetAdapter,
      pypi: pypiAdapter,
    }[registry]?.(packsRoot);
    assert.ok(
      adapter,
      `${registry} publication runs through its dedicated script`,
    );
    if (command === "check") {
      for (const step of steps) {
        const state = await adapter.existing(step);
        if (state === "different")
          throw new Error(`${step.id} already exists with different contents`);
        console.log(`${step.id}: ${state}`);
      }
    } else if (command === "confirm") {
      for (const step of steps)
        assert.equal(
          await adapter.verify(step),
          true,
          `${step.id} is not confirmed`,
        );
      console.log(`${registry}: every planned artifact is confirmed.`);
    } else {
      const results = await executeSteps(steps, adapter, {
        dryRun: process.env.NATIVE_PUBLISH_DRY_RUN === "1",
      });
      writeFileSync(
        join(packsRoot, `${registry}-results.json`),
        JSON.stringify(results, null, 2) + "\n",
      );
      if (results.some((r) => r.state === "failed" || r.state === "blocked"))
        process.exitCode = 1;
    }
  } else throw new Error("Use plan, check, publish or confirm");
}
