import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { validateAcceptance } from "./release-gate.mjs";

const directory = resolve(process.env.RELEASE_OUTPUT);
const provenance = JSON.parse(
  readFileSync(join(directory, "release-contract.json")),
);
const channel = process.env.RELEASE_CHANNEL;
assert.equal(provenance.channel, channel);
assert.equal(provenance.sourceSha, process.env.GITHUB_SHA);
assert.equal(provenance.repository, "polymorfa/sdks");
const environment = channel === "stable" ? "production" : "staging";
validateAcceptance(provenance.acceptance, {
  ...provenance.acceptance,
  environment,
});
const tag = channel === "stable" ? "latest" : "dev";
const manifest = JSON.parse(readFileSync(join(directory, "manifest.json")));
for (const pkg of manifest) {
  assert.equal(pkg.version, provenance.packageVersion);
  assert.match(pkg.tarball, /^[a-zA-Z0-9._-]+\.tgz$/);
  const archive = join(directory, pkg.tarball);
  const integrity = `sha512-${createHash("sha512").update(readFileSync(archive)).digest("base64")}`;
  assert.equal(integrity, pkg.integrity);
  const embedded = JSON.parse(
    execFileSync(
      "tar",
      ["-xzOf", archive, "package/dist/release-contract.json"],
      { encoding: "utf8" },
    ),
  );
  assert.deepEqual(embedded, provenance);
  const url = `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${encodeURIComponent(pkg.version)}`;
  let response = await fetch(url, {
    signal: AbortSignal.timeout(30_000),
    redirect: "error",
  });
  if (response.status === 404) {
    execFileSync(
      "npm",
      ["publish", archive, "--tag", tag, "--access", "public", "--provenance"],
      { stdio: "inherit" },
    );
    for (let attempt = 0; attempt < 12; attempt++) {
      response = await fetch(url, {
        signal: AbortSignal.timeout(30_000),
        redirect: "error",
      });
      if (response.status !== 404) break;
      await new Promise((done) => setTimeout(done, 5000));
    }
  }
  assert.equal(
    response.status,
    200,
    `Registry verification failed for ${pkg.name}`,
  );
  assert.equal(
    (await response.json()).dist.integrity,
    integrity,
    "Existing npm version has different tarball contents",
  );
  // Repair a missing tag after a partially successful retry, preserving versions.
  const tagged = await fetch(
    `https://registry.npmjs.org/${encodeURIComponent(pkg.name)}/${tag}`,
    { signal: AbortSignal.timeout(30_000), redirect: "error" },
  );
  assert.equal(tagged.status, 200);
  assert.equal(
    (await tagged.json()).version,
    pkg.version,
    `Published version needs ${tag} dist-tag repair before recording completion`,
  );
}
const packages = Object.fromEntries(
  manifest.map((pkg) => [pkg.name, pkg.version]),
);
const events = (provenance.acceptance.featureLinks ?? []).map((feature) => {
  const stage = channel === "stable" ? "stable_published" : "nightly_published";
  const identity = {
    featureId: feature.id,
    stage,
    sourceSha: provenance.acceptance.sourceSha,
    apiVersion: provenance.acceptance.apiVersion,
    packages,
  };
  return {
    schemaVersion: 1,
    eventId: createHash("sha256")
      .update(JSON.stringify(identity))
      .digest("hex"),
    ...identity,
    sdkSourceSha: provenance.sourceSha,
    notionUrl: feature.notionUrl,
    linearIssueIds: feature.linearIssueIds,
    trackingStatus: feature.trackingStatus,
    environment,
    evidenceUrl: provenance.acceptance.runUrl,
    occurredAt: new Date().toISOString(),
  };
});
writeFileSync(
  join(directory, "stage-events.json"),
  JSON.stringify(events, null, 2) + "\n",
);
