import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, mkdirSync, mkdtempSync, copyFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import { previewProvenance, releaseVersion } from "./release-gate.mjs";
import { releaseTag, validateReleaseAuthorization } from "./release-policy.mjs";

const manual = {
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_RUN_ID: "123",
  GITHUB_ACTOR: "synthetic-operator",
};
function fixture() {
  return {
    schemaVersion: 1,
    repository: "polymorfa/sdks",
    sourceSha: "a".repeat(40),
    fingerprint: "b".repeat(64),
    channel: "preview",
    packageVersion: "0.1.0-preview.20261116120000",
    acceptance: null,
    preview: previewProvenance(manual),
  };
}
test("preview records real source holds and incomplete coverage without accepting the API", () => {
  const receipt = fixture();
  validateReleaseAuthorization(receipt);
  const guest = JSON.parse(
    readFileSync(
      new URL("../contracts/calls-guests.candidate.json", import.meta.url),
    ),
  );
  const pin = receipt.preview.featureContracts.find(
    (f) => f.file === "contracts/calls-guests.candidate.json",
  );
  assert.equal(pin.sourceAccepted, guest.sourceAccepted);
  assert.equal(pin.published, guest.published);
  assert.equal(receipt.acceptance, null);
  const ledger = JSON.parse(
    readFileSync(new URL("../contracts/coverage.json", import.meta.url)),
  );
  assert.equal(
    receipt.preview.coverage.operationCount,
    ledger.operations.length,
  );
  assert.equal(releaseTag("preview"), "preview");
  assert.equal(releaseTag("nightly"), "dev");
  assert.equal(releaseTag("stable"), "latest");
});
test("preview cannot claim acceptance or promote its receipt to nightly or stable", () => {
  for (const mutate of [
    (r) => {
      r.acceptance = { result: "passed" };
    },
    (r) => {
      r.preview.apiAcceptance = "passed";
    },
    (r) => {
      r.preview.authorization.eventName = "schedule";
    },
    (r) => {
      r.preview.authorization.ref = "refs/heads/feature";
    },
    (r) => {
      r.preview.apiSource.contracts.messaging.sha256 = "invalid";
    },
    (r) => {
      r.preview.coverage.languages.go.incomplete = [];
    },
    (r) => {
      r.channel = "nightly";
      r.packageVersion = "0.1.0-dev.20261116120000";
    },
    (r) => {
      r.channel = "stable";
      r.packageVersion = "0.1.0";
    },
    (r) => {
      r.channel = "nightly";
      r.packageVersion = "0.1.0-dev.20261116120000";
      delete r.preview;
    },
  ]) {
    const receipt = fixture();
    mutate(receipt);
    assert.throws(() => validateReleaseAuthorization(receipt));
  }
});
test("preview versions are distinct and can coordinate one immutable version across workflows", () => {
  const version = "0.1.0-preview.20261116120000";
  assert.equal(
    releaseVersion(
      "preview",
      undefined,
      "0.1.0",
      new Date("2026-11-16T12:00:00Z"),
    ),
    version,
  );
  assert.equal(releaseVersion("preview", version, "0.1.0"), version);
  for (const bad of [
    "0.1.0",
    "0.1.0-dev.20261116120000",
    "0.2.0-preview.20261116120000",
  ])
    assert.throws(() => releaseVersion("preview", bad, "0.1.0"));
  assert.throws(() => releaseVersion("nightly", version, "0.1.0"));
});
test("release source refuses a dirty, mismatched or unmerged revision", async () => {
  const parent = join(homedir(), ".polymorfa-agent-work/sdk-preview-tests");
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "source-"));
  mkdirSync(join(dir, "scripts"));
  for (const name of [
    "release-gate.mjs",
    "release-policy.mjs",
    "check-coverage.mjs",
    "interactive-supplement.mjs",
    "native-supplements.mjs",
  ])
    copyFileSync(
      new URL(`./${name}`, import.meta.url),
      join(dir, "scripts", name),
    );
  const git = (...args) =>
    execFileSync("git", args, {
      cwd: dir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git("init", "-q", "-b", "main");
  git("add", "scripts");
  git(
    "-c",
    "user.name=SDK test",
    "-c",
    "user.email=sdk-test@example.invalid",
    "commit",
    "-qm",
    "Synthetic source",
  );
  const sha = git("rev-parse", "HEAD");
  git("update-ref", "refs/remotes/origin/main", sha);
  const { releaseSource } = await import(
    pathToFileURL(join(dir, "scripts/release-gate.mjs")).href
  );
  assert.equal(releaseSource({ ...manual, GITHUB_SHA: sha }), sha);
  assert.throws(
    () => releaseSource({ ...manual, GITHUB_SHA: "b".repeat(40) }),
    /workflow revision/,
  );
  assert.throws(
    () =>
      releaseSource({
        ...manual,
        GITHUB_REF: "refs/heads/feature",
        GITHUB_SHA: sha,
      }),
    /only from main/,
  );
  git(
    "-c",
    "user.name=SDK test",
    "-c",
    "user.email=sdk-test@example.invalid",
    "commit",
    "--allow-empty",
    "-qm",
    "Synthetic unmerged source",
  );
  const unmerged = git("rev-parse", "HEAD");
  assert.throws(
    () => releaseSource({ ...manual, GITHUB_SHA: unmerged }),
    /must be merged/,
  );
  git("update-ref", "refs/remotes/origin/main", unmerged);
  assert.equal(releaseSource({ ...manual, GITHUB_SHA: unmerged }), unmerged);
  git("update-ref", "-d", "refs/remotes/origin/main");
  assert.throws(
    () => releaseSource({ ...manual, GITHUB_SHA: unmerged }),
    /must be merged/,
  );
  git("update-ref", "refs/remotes/origin/main", unmerged);
  copyFileSync(
    new URL("./release-policy.test.mjs", import.meta.url),
    join(dir, "untracked.mjs"),
  );
  assert.throws(
    () => releaseSource({ ...manual, GITHUB_SHA: unmerged }),
    /must be clean/,
  );
});
