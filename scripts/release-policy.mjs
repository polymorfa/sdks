import assert from "node:assert/strict";

export const releaseChannels = ["preview", "nightly", "stable"];
export const releaseTag = (channel) => {
  assert.ok(releaseChannels.includes(channel), "Unknown release channel");
  return { preview: "preview", nightly: "dev", stable: "latest" }[channel];
};
export function validateReleaseVersion(channel, version) {
  releaseTag(channel);
  const suffix = {
    preview: "-preview\\.\\d{14}",
    nightly: "-dev\\.\\d{14}",
    stable: "",
  }[channel];
  assert.match(
    version,
    new RegExp(`^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)${suffix}$`),
    "Version does not match channel",
  );
  return version;
}
export const pythonVersion = (version) =>
  version.replace(/-preview\./, "a0.dev").replace(/-dev\./, ".dev");

export function validateAcceptance(receipt, expected) {
  assert.equal(receipt?.schemaVersion, 1);
  assert.equal(receipt.repository, "polymorfa/polymorfa");
  for (const key of ["sourceSha", "apiVersion", "environment"])
    assert.equal(receipt[key], expected[key], `Acceptance ${key} mismatch`);
  assert.deepEqual(
    receipt.contracts,
    expected.contracts,
    "Acceptance spec mismatch",
  );
  assert.equal(receipt.result, "passed");
  assert.ok(
    receipt.scenarios?.length &&
      receipt.scenarios.every((s) => s.result === "passed"),
  );
  assert.equal(receipt.deployment?.commit, expected.sourceSha);
  assert.equal(receipt.deployment?.status, "finished");
  assert.ok(Number.isFinite(Date.parse(receipt.acceptedAt)));
  assert.match(
    receipt.runUrl,
    /^https:\/\/github\.com\/polymorfa\/polymorfa\/actions\/runs\/\d+$/,
  );
  return receipt;
}

export function validatePreview(preview) {
  assert.equal(
    preview?.apiAcceptance,
    "not-verified",
    "Preview cannot claim API acceptance",
  );
  const { apiSource, authorization, coverage, featureContracts } = preview;
  assert.equal(apiSource?.repository, "polymorfa/polymorfa");
  assert.match(apiSource.sourceSha, /^[a-f0-9]{40}$/);
  assert.match(apiSource.apiVersion, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(Object.keys(apiSource.contracts).sort(), [
    "messaging",
    "platform",
  ]);
  for (const [family, path] of Object.entries({
    messaging: "apps/api/docs/openapi.json",
    platform: "apps/api/docs/openapi.management.json",
  })) {
    assert.equal(apiSource.contracts[family].sourcePath, path);
    assert.match(apiSource.contracts[family].sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(
    authorization?.eventName,
    "workflow_dispatch",
    "Preview publication requires manual dispatch",
  );
  assert.equal(
    authorization.ref,
    "refs/heads/main",
    "Preview publication runs only from main",
  );
  assert.match(
    authorization.runUrl,
    /^https:\/\/github\.com\/polymorfa\/sdks\/actions\/runs\/\d+$/,
  );
  assert.ok(
    typeof authorization.actor === "string" && authorization.actor.length > 0,
  );
  assert.ok(
    Array.isArray(featureContracts) &&
      featureContracts.some(
        (f) => f.file === "contracts/calls-guests.candidate.json",
      ),
  );
  assert.equal(
    new Set(featureContracts.map((f) => f.file)).size,
    featureContracts.length,
  );
  for (const feature of featureContracts) {
    assert.match(feature.file, /^contracts\/[a-z0-9.-]+\.json$/);
    assert.match(feature.sha256, /^[a-f0-9]{64}$/);
  }
  assert.equal(coverage?.path, "contracts/coverage.json");
  assert.match(coverage.sha256, /^[a-f0-9]{64}$/);
  assert.equal(coverage.sourceCommit, apiSource.sourceSha);
  assert.ok(
    Number.isSafeInteger(coverage.operationCount) &&
      coverage.operationCount > 0,
  );
  assert.deepEqual(Object.keys(coverage.languages).sort(), [
    "dotnet",
    "go",
    "php",
    "python",
    "rust",
    "typescript",
  ]);
  for (const { counts, incomplete } of Object.values(coverage.languages)) {
    assert.deepEqual(Object.keys(counts).sort(), [
      "covered",
      "excluded",
      "missing",
      "partial",
    ]);
    assert.ok(
      Object.values(counts).every((n) => Number.isSafeInteger(n) && n >= 0),
    );
    assert.equal(
      Object.values(counts).reduce((sum, n) => sum + n, 0),
      coverage.operationCount,
    );
    assert.equal(incomplete.length, counts.missing + counts.partial);
    for (const status of ["missing", "partial"])
      assert.equal(
        incomplete.filter((o) => o.status === status).length,
        counts[status],
      );
    assert.equal(
      new Set(incomplete.map((o) => o.operationId)).size,
      incomplete.length,
    );
    for (const operation of incomplete) {
      assert.ok(
        typeof operation.operationId === "string" &&
          operation.operationId.length > 0,
      );
      assert.ok(["missing", "partial"].includes(operation.status));
    }
  }
  return preview;
}

export function validateReleaseAuthorization(provenance) {
  assert.equal(provenance?.schemaVersion, 1);
  assert.equal(provenance.repository, "polymorfa/sdks");
  assert.match(provenance.sourceSha, /^[a-f0-9]{40}$/);
  assert.match(provenance.fingerprint, /^[a-f0-9]{64}$/);
  const version = provenance.versions?.semver ?? provenance.packageVersion;
  validateReleaseVersion(provenance.channel, version);
  if (provenance.packageVersion !== undefined)
    assert.equal(provenance.packageVersion, version);
  if (provenance.channel === "preview") {
    assert.equal(
      provenance.acceptance,
      null,
      "Preview must not carry an accepted API receipt",
    );
    validatePreview(provenance.preview);
  } else {
    assert.equal(
      provenance.preview,
      undefined,
      "Preview provenance cannot authorize an accepted release",
    );
    validateAcceptance(provenance.acceptance, {
      ...provenance.acceptance,
      environment: provenance.channel === "stable" ? "production" : "staging",
    });
  }
  return provenance;
}
