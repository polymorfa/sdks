import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync, mkdirSync, readdirSync } from "node:fs";
import { resolve, join } from "node:path";
import { pathToFileURL } from "node:url";
import { compareCoverage, extractOperations } from "./check-coverage.mjs";
import {
  releaseChannels,
  releaseTag,
  validateAcceptance,
  validatePreview,
  validateReleaseAuthorization,
  validateReleaseVersion,
} from "./release-policy.mjs";
export { validateAcceptance } from "./release-policy.mjs";

const root = resolve(import.meta.dirname, "..");
const hash = (value) => createHash("sha256").update(value).digest("hex");
export function validateFeatureContractPins(source, pins) {
  for (const pin of pins) {
    assert.equal(
      pin.repository,
      source.repository,
      "Feature contract repository mismatch",
    );
    assert.equal(
      pin.sourceCommit,
      source.commit,
      "Feature contract source has not been reconciled with the release contract",
    );
    assert.ok(
      ["messaging", "platform"].includes(pin.family),
      "Feature contract family is required",
    );
    assert.notEqual(
      pin.published,
      false,
      "Feature contract is held from publication",
    );
    assert.equal(
      pin.sourcePath,
      source.contracts[pin.family]?.sourcePath,
      "Feature contract source path mismatch",
    );
    assert.equal(
      pin.sourceSha256,
      source.contracts[pin.family]?.sha256,
      "Feature contract hash mismatch",
    );
  }
}
export function validateGuestCallPublication(source, candidate, apiVersion) {
  assert.equal(candidate.schemaVersion, 1);
  for (const scope of [candidate, candidate.httpControl]) {
    assert.equal(
      scope?.sourceAccepted,
      true,
      "Guest calls are held from publication until API source acceptance",
    );
    assert.equal(
      scope.published,
      true,
      "Guest calls are held from publication",
    );
  }
  assert.equal(
    candidate.apiVersion,
    apiVersion,
    "Guest-call API version mismatch",
  );
  assert.ok(
    Array.isArray(candidate.candidateSource?.files),
    "Guest-call source files are required",
  );
  const files = candidate.candidateSource.files.filter(
    (file) => file.path === source.contracts.messaging.sourcePath,
  );
  assert.equal(
    files.length,
    1,
    "Guest calls require one Messaging contract source",
  );
  assert.match(files[0].sha256, /^[a-f0-9]{64}$/);
  validateFeatureContractPins(source, [
    {
      repository: candidate.candidateSource.repository,
      sourceCommit: candidate.candidateSource.commit,
      family: "messaging",
      published: candidate.published,
      sourcePath: files[0].path,
      sourceSha256: files[0].sha256,
    },
  ]);
}

// Expands a supplement that pins both audiences into one pin per family.
export function multiSourcePins(supplement) {
  return Object.entries(supplement.sources).map(([family, spec]) => ({
    repository: supplement.repository,
    sourceCommit: supplement.commit,
    family,
    published: supplement.published,
    sourcePath: spec.sourcePath,
    sourceSha256: spec.sourceSha256,
  }));
}
export function campaignSupplementPins(supplement) {
  assert.deepEqual(Object.keys(supplement.sources).sort(), [
    "messaging",
    "platform",
  ]);
  return Object.entries(supplement.sources).map(([family, snapshot]) => ({
    repository: supplement.repository,
    sourceCommit: supplement.commit,
    published: supplement.published,
    family,
    sourcePath: snapshot.sourcePath,
    sourceSha256: snapshot.sourceSha256,
  }));
}
export function expectedContract(channel = "stable") {
  assert.ok(releaseChannels.includes(channel));
  // Campaign supplements carry separate Messaging and Platform source hashes.
  const source = JSON.parse(readFileSync(join(root, "contracts/source.json")));
  assert.equal(source.repository, "polymorfa/polymorfa");
  assert.match(source.commit, /^[a-f0-9]{40}$/);
  const apiVersion = /NATIVE_API_VERSION = "([^"]+)"/.exec(
    readFileSync(join(root, "packages/typescript/src/version.ts"), "utf8"),
  )?.[1];
  assert.ok(apiVersion);
  // Preview publication records the held source without claiming acceptance.
  // Nightly and stable publication retain every existing feature gate.
  if (channel !== "preview") {
    validateGuestCallPublication(
      source,
      JSON.parse(
        readFileSync(join(root, "contracts/calls-guests.candidate.json")),
      ),
      apiVersion,
    );
    validateFeatureContractPins(source, [
      ...multiSourcePins(
        JSON.parse(
          readFileSync(join(root, "contracts/calls-simultaneous-calls.json")),
        ),
      ),
      JSON.parse(
        readFileSync(join(root, "contracts/analytics-device-signals.json")),
      ),
      JSON.parse(
        readFileSync(join(root, "contracts/abprops-capabilities.json")),
      ),
      JSON.parse(readFileSync(join(root, "contracts/request-logs.json"))),
      JSON.parse(
        readFileSync(join(root, "contracts/client-token-ceilings.json")),
      ),
      ...[
        "campaign-ab-tests.json",
        "campaign-message-variations.json",
        "campaign-follow-ups.json",
        "campaign-custody-20261014.json",
        // Integrated main supplements: released only after their source is
        // reconciled with the accepted release contract.
        "campaign-frequency-cap.json",
        "campaign-segments-drip.json",
      ].flatMap((name) =>
        campaignSupplementPins(
          JSON.parse(readFileSync(join(root, "contracts", name))),
        ),
      ),
    ]);
    validateFeatureContractPins(source, [
      JSON.parse(
        readFileSync(join(root, "contracts/official-api-round2.json")),
      ),
    ]);
  }
  const contracts = Object.fromEntries(
    Object.entries(source.contracts).map(([name, spec]) => {
      assert.ok(["messaging", "platform"].includes(name));
      const snapshot =
        name === "messaging"
          ? "contracts/openapi.messaging.json"
          : "contracts/openapi.platform.json";
      assert.equal(spec.snapshotPath, snapshot);
      assert.equal(hash(readFileSync(join(root, snapshot))), spec.sha256);
      return [name, { sourcePath: spec.sourcePath, sha256: spec.sha256 }];
    }),
  );
  assert.deepEqual(Object.keys(contracts).sort(), ["messaging", "platform"]);
  return { sourceSha: source.commit, apiVersion, contracts };
}
export function previewProvenance(env = process.env) {
  const apiSource = {
    repository: "polymorfa/polymorfa",
    ...expectedContract("preview"),
  };
  const coverageBytes = readFileSync(join(root, "contracts/coverage.json"));
  const ledger = JSON.parse(coverageBytes);
  assert.equal(ledger.sourceCommit, apiSource.sourceSha);
  compareCoverage(
    ["messaging", "platform"].flatMap((family) =>
      extractOperations(
        family,
        JSON.parse(
          readFileSync(join(root, `contracts/openapi.${family}.json`)),
        ),
      ),
    ),
    ledger,
    true,
  );
  const featureContracts = readdirSync(join(root, "contracts"))
    .filter(
      (file) =>
        file.endsWith(".json") &&
        !file.startsWith("openapi.") &&
        !file.startsWith("doc-snippets") &&
        !["source.json", "coverage.json"].includes(file),
    )
    .sort()
    .flatMap((name) => {
      const bytes = readFileSync(join(root, "contracts", name));
      const value = JSON.parse(bytes);
      const repository = value.repository ?? value.candidateSource?.repository;
      if (!repository) return [];
      return [
        {
          file: `contracts/${name}`,
          sha256: hash(bytes),
          repository,
          sourceCommit:
            value.commit ??
            value.sourceCommit ??
            value.candidateSource?.commit ??
            null,
          sourceAccepted: value.sourceAccepted ?? null,
          published: value.published ?? null,
        },
      ];
    });
  const preview = {
    apiAcceptance: "not-verified",
    apiSource,
    authorization: {
      eventName: env.GITHUB_EVENT_NAME,
      ref: env.GITHUB_REF,
      runUrl: `https://github.com/polymorfa/sdks/actions/runs/${env.GITHUB_RUN_ID}`,
      actor: env.GITHUB_ACTOR,
    },
    featureContracts,
    coverage: {
      path: "contracts/coverage.json",
      sha256: hash(coverageBytes),
      sourceCommit: ledger.sourceCommit,
      operationCount: ledger.operations.length,
      languages: Object.fromEntries(
        ledger.languages.map((language) => {
          const counts = { covered: 0, partial: 0, missing: 0, excluded: 0 };
          const incomplete = [];
          for (const operation of ledger.operations) {
            counts[operation[language].status]++;
            if (["missing", "partial"].includes(operation[language].status))
              incomplete.push({
                operationId: operation.operationId,
                status: operation[language].status,
              });
          }
          return [language, { counts, incomplete }];
        }),
      ),
    },
  };
  return validatePreview(preview);
}
function sourceRevision() {
  assert.equal(
    execFileSync("git", ["status", "--porcelain"], {
      cwd: root,
      encoding: "utf8",
    }).trim(),
    "",
    "Release source must be clean",
  );
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  }).trim();
  return sha;
}
export function verifySourceProvenance(provenance) {
  assert.equal(
    provenance.sourceSha,
    sourceRevision(),
    "Package provenance source differs from checkout",
  );
  assert.equal(
    provenance.fingerprint,
    publicationFingerprint(),
    "Package provenance fingerprint differs from checkout",
  );
  return provenance;
}
export function releaseSource(env = process.env) {
  assert.equal(
    env.GITHUB_REF,
    "refs/heads/main",
    "SDK publication runs only from main",
  );
  const sha = sourceRevision();
  assert.equal(
    sha,
    env.GITHUB_SHA,
    "Release source differs from workflow revision",
  );
  try {
    execFileSync("git", ["merge-base", "--is-ancestor", sha, "origin/main"], {
      cwd: root,
      stdio: "pipe",
    });
  } catch {
    throw new Error("Release source must be merged into origin/main");
  }
  return sha;
}
export function publicationFingerprint() {
  const files = execFileSync(
    "git",
    [
      "ls-files",
      "-z",
      "packages",
      "scripts",
      "contracts",
      "package.json",
      "package-lock.json",
    ],
    { cwd: root },
  )
    .toString()
    .split("\0")
    .filter(Boolean)
    .sort();
  const digest = createHash("sha256");
  for (const file of files)
    digest
      .update(file + "\0")
      .update(readFileSync(join(root, file)))
      .update("\0");
  return digest.digest("hex");
}
function github(path, binary = false) {
  try {
    return execFileSync("gh", ["api", path], {
      encoding: binary ? undefined : "utf8",
      maxBuffer: 16 * 1024 * 1024,
    });
  } catch {
    throw new Error(
      "Cannot read trusted API acceptance evidence. Check the GitHub App's repository and Actions read access.",
    );
  }
}
export async function acceptedContract(expected, output) {
  const branch = expected.environment === "staging" ? "dev" : "main";
  for (let page = 1; page <= 10; page++) {
    const { workflow_runs: runs } = JSON.parse(
      github(
        `/repos/polymorfa/polymorfa/actions/workflows/api-contract-acceptance.yml/runs?branch=${branch}&event=workflow_dispatch&status=success&per_page=100&page=${page}`,
      ),
    );
    assert.ok(Array.isArray(runs));
    for (const run of runs) {
      if (
        run.conclusion !== "success" ||
        run.event !== "workflow_dispatch" ||
        run.head_branch !== branch ||
        run.path !== ".github/workflows/api-contract-acceptance.yml"
      )
        continue;
      const { artifacts } = JSON.parse(
        github(
          `/repos/polymorfa/polymorfa/actions/runs/${run.id}/artifacts?per_page=100`,
        ),
      );
      const artifact = artifacts.find(
        (a) =>
          !a.expired &&
          a.name ===
            `api-contract-${expected.environment}-${expected.sourceSha}`,
      );
      if (!artifact) continue;
      const archive = join(output, "api-acceptance.zip");
      writeFileSync(
        archive,
        github(
          `/repos/polymorfa/polymorfa/actions/artifacts/${artifact.id}/zip`,
          true,
        ),
        { mode: 0o600 },
      );
      const receipt = JSON.parse(
        execFileSync("unzip", ["-p", archive, "acceptance.json"], {
          encoding: "utf8",
          maxBuffer: 2 * 1024 * 1024,
        }),
      );
      validateAcceptance(receipt, expected);
      assert.equal(receipt.runUrl, run.html_url);
      return receipt;
    }
    if (runs.length < 100) break;
  }
  throw new Error(
    `No exact ${expected.environment} API acceptance receipt for ${expected.sourceSha}`,
  );
}
export async function publishedProvenance(tag, output) {
  const response = await fetch(
    `https://registry.npmjs.org/@polymorfa%2fsdk/${encodeURIComponent(tag)}`,
    { signal: AbortSignal.timeout(30_000), redirect: "error" },
  );
  if (response.status === 404) return null;
  assert.equal(response.status, 200, "Cannot query the npm release authority");
  const pkg = await response.json();
  const url = new URL(pkg.dist.tarball);
  assert.equal(url.origin, "https://registry.npmjs.org");
  assert.ok(!url.username && !url.password && !url.search && !url.hash);
  const tar = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  assert.equal(tar.status, 200);
  const bytes = Buffer.from(await tar.arrayBuffer());
  assert.ok(bytes.length < 32 * 1024 * 1024);
  assert.equal(
    `sha512-${createHash("sha512").update(bytes).digest("base64")}`,
    pkg.dist.integrity,
  );
  const archive = join(output, "published-sdk.tgz");
  writeFileSync(archive, bytes, { mode: 0o600 });
  const files = execFileSync("tar", ["-tzf", archive], {
    encoding: "utf8",
  }).split("\n");
  if (!files.includes("package/dist/release-contract.json")) return null;
  const provenance = JSON.parse(
    execFileSync(
      "tar",
      ["-xzOf", archive, "package/dist/release-contract.json"],
      { encoding: "utf8", maxBuffer: 2 * 1024 * 1024 },
    ),
  );
  assert.equal(provenance.packageVersion, pkg.version);
  assert.equal(provenance.repository, "polymorfa/sdks");
  return provenance;
}
export function releaseVersion(channel, requested, base, date = new Date()) {
  assert.ok(releaseChannels.includes(channel));
  if (channel === "stable") {
    assert.match(requested ?? "", /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/);
    return requested;
  }
  if (channel === "preview" && requested !== undefined) {
    validateReleaseVersion(channel, requested);
    assert.ok(
      requested.startsWith(`${base}-preview.`),
      "Preview must use the source package base version",
    );
    return requested;
  }
  assert.equal(
    requested,
    undefined,
    "Prerelease versions are generated by the workflow",
  );
  return `${base}-${channel === "preview" ? "preview" : "dev"}.${date.toISOString().replace(/\D/g, "").slice(0, 14)}`;
}
async function prepare() {
  const sourceSha = releaseSource();
  const channel = process.env.RELEASE_CHANNEL;
  const environment = channel === "stable" ? "production" : "staging";
  const output = resolve(process.env.RELEASE_OUTPUT);
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const expected = { ...expectedContract(channel), environment };
  const acceptance =
    channel === "preview" ? null : await acceptedContract(expected, output);
  const preview = channel === "preview" ? previewProvenance() : undefined;
  const fingerprint = publicationFingerprint();
  const previous = await publishedProvenance(releaseTag(channel), output);
  if (channel === "nightly" && previous?.fingerprint === fingerprint) {
    writeFileSync(process.env.GITHUB_OUTPUT, "publish=false\n", { flag: "a" });
    console.log(
      "Matching SDK source is already published; skipping this nightly.",
    );
    return;
  }
  const base = JSON.parse(
    readFileSync(join(root, "packages/typescript/package.json")),
  ).version.split("-")[0];
  const version = releaseVersion(
    channel,
    process.env.RELEASE_VERSION || undefined,
    base,
  );
  if (channel === "stable" && previous?.packageVersion === version)
    assert.equal(
      previous.fingerprint,
      fingerprint,
      "Stable version already belongs to different source",
    );
  const provenance = {
    schemaVersion: 1,
    repository: "polymorfa/sdks",
    sourceSha,
    fingerprint,
    channel,
    packageVersion: version,
    acceptance,
    ...(preview ? { preview } : {}),
  };
  validateReleaseAuthorization(provenance);
  writeFileSync(
    join(output, "release-contract.json"),
    JSON.stringify(provenance, null, 2) + "\n",
    { mode: 0o600 },
  );
  writeFileSync(
    process.env.GITHUB_OUTPUT,
    `publish=true\nversion=${version}\n`,
    { flag: "a" },
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  try {
    await prepare();
  } catch (error) {
    console.error(error.message);
    process.exitCode = 1;
  }
}
