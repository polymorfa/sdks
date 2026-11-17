import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  acceptedContract,
  expectedContract,
  publicationFingerprint,
  releaseVersion,
  previewProvenance,
  releaseSource,
} from "./release-gate.mjs";
import {
  pythonVersion,
  releaseChannels,
  validateReleaseAuthorization,
} from "./release-policy.mjs";

import { compareCoverage, extractOperations } from "./check-coverage.mjs";

const root = resolve(import.meta.dirname, "..");
export const nativeLanguages = ["go", "python", "php", "dotnet", "rust"];
export function versions(channel, requested, date = new Date()) {
  const semver = releaseVersion(channel, requested, "0.1.0", date);
  return {
    semver,
    python: pythonVersion(semver),
    goTag: `packages/go/v${semver}`,
  };
}
export function requireNativeCoverage(
  ledger,
  manifests,
  actual,
  { allowIncomplete = false } = {},
) {
  assert.equal(ledger.schemaVersion, 2);
  assert.ok(
    Array.isArray(actual),
    "Pinned contract operations are required for release",
  );
  compareCoverage(actual, ledger, true);
  for (const language of nativeLanguages) {
    const manifest = manifests[language];
    assert.match(manifest.sourceSdkCommit, /^[a-f0-9]{40}$/);
    assert.equal(
      manifest.sourceSdkCommit,
      manifests.go.sourceSdkCommit,
      "All native SDKs must use the same implementation reference",
    );
    const entries = new Map(
      manifest.operations.map((entry) => [
        `${entry.family} ${entry.method} ${entry.path}`,
        entry,
      ]),
    );
    for (const operation of ledger.operations) {
      const key = `${operation.family} ${operation.method} ${operation.path}`;
      const claim = operation[language];
      const entry = entries.get(key);
      assert.ok(entry, `${language}: missing ${key}`);
      assert.equal(
        claim.status,
        entry.status,
        `${language}: ledger mismatch ${key}`,
      );
      if (!allowIncomplete && operation.typescript.status === "covered")
        assert.equal(
          entry.status,
          "covered",
          `${language}: missing pinned TypeScript method ${key}`,
        );
      if (entry.status === "covered") {
        assert.ok(
          entry.sdkMethod && entry.testFile,
          `${language}: covered method needs native evidence ${key}`,
        );
      } else {
        assert.ok(
          (allowIncomplete
            ? ["excluded", "missing", "partial"]
            : ["excluded"]
          ).includes(entry.status),
          `${language}: unfinished ${key}`,
        );
        assert.ok(
          entry.reason,
          `${language}: exclusion requires reason ${key}`,
        );
      }
    }
  }
}
export async function prepareNativeRelease() {
  const sourceSha = releaseSource();
  const channel = process.env.RELEASE_CHANNEL;
  assert.ok(releaseChannels.includes(channel));
  const output = resolve(
    process.env.RELEASE_OUTPUT ?? join(root, ".release/native"),
  );
  mkdirSync(output, { recursive: true, mode: 0o700 });
  const manifests = Object.fromEntries(
    nativeLanguages.map((language) => [
      language,
      JSON.parse(
        readFileSync(join(root, "packages", language, "coverage.json")),
      ),
    ]),
  );
  requireNativeCoverage(
    JSON.parse(readFileSync(join(root, "contracts/coverage.json"))),
    manifests,
    ["messaging", "platform"].flatMap((family) =>
      extractOperations(
        family,
        JSON.parse(
          readFileSync(join(root, "contracts", `openapi.${family}.json`)),
        ),
      ),
    ),
    { allowIncomplete: channel === "preview" },
  );
  const expected = {
    ...expectedContract(channel),
    environment: channel === "stable" ? "production" : "staging",
  };
  const acceptance =
    channel === "preview" ? null : await acceptedContract(expected, output);
  const preview = channel === "preview" ? previewProvenance() : undefined;
  const version = versions(channel, process.env.RELEASE_VERSION || undefined);
  const provenance = {
    schemaVersion: 1,
    repository: "polymorfa/sdks",
    sourceSha,
    fingerprint: publicationFingerprint(),
    channel,
    versions: version,
    sourceSdkCommit: manifests.go.sourceSdkCommit,
    acceptance,
    ...(preview ? { preview } : {}),
  };
  validateReleaseAuthorization(provenance);
  writeFileSync(
    join(output, "release-contract.json"),
    JSON.stringify(provenance, null, 2) + "\n",
    { mode: 0o600 },
  );
  if (process.env.GITHUB_OUTPUT)
    writeFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${version.semver}\npython-version=${version.python}\ngo-tag=${version.goTag}\n`,
      { flag: "a" },
    );
  console.log(
    `Native ${channel} release prepared. No packages have been published.`,
  );
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
)
  await prepareNativeRelease();
