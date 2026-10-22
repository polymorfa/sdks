// Publishes the accepted PHP mirror preparation (scripts/prepare-php-mirror.py)
// to the dedicated Composer root repository. Only the inspected archive's files
// are committed; there is no workspace or source fallback.
//
// push <prepared-dir> <remote>   fast-forward main, and tag v<version> for stable
// verify <prepared-dir> <commit> require Packagist metadata to reference the commit
//
// Never forces or moves a branch or tag. Credentials come from PHP_MIRROR_TOKEN
// through Git configuration environment variables, never arguments.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import {
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
  mkdirSync,
} from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { pathToFileURL } from "node:url";

const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");
function files(dir, base = dir, out = {}) {
  for (const name of readdirSync(dir)) {
    if (name === ".git") continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) files(path, base, out);
    else out[relative(base, path)] = sha256(readFileSync(path));
  }
  return out;
}
function authEnv() {
  const token = process.env.PHP_MIRROR_TOKEN;
  if (!token) return {};
  return {
    GIT_CONFIG_COUNT: "1",
    GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
    GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${token}`).toString("base64")}`,
  };
}
const git = (cwd, args) =>
  execFileSync("git", args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...authEnv() },
  }).trim();
const remoteRef = (cwd, remote, ref) => {
  const line = git(cwd, ["ls-remote", remote, ref, `${ref}^{}`])
    .split("\n")
    .filter(Boolean);
  if (!line.length) return null;
  return (line.find((l) => l.endsWith("^{}")) ?? line[0]).split(/\s+/)[0];
};

export function loadPreparation(prepared) {
  const plan = JSON.parse(readFileSync(join(prepared, "mirror-plan.json")));
  assert.equal(plan.schemaVersion, 1);
  assert.equal(plan.package, "polymorfa/sdk");
  assert.equal(plan.publication, "not performed");
  assert.deepEqual(
    files(join(prepared, plan.sourceDirectory)),
    plan.files,
    "Prepared mirror files differ from the inspected plan",
  );
  return plan;
}

export function push(
  prepared,
  remote,
  receiptPath = process.env.PHP_MIRROR_RECEIPT,
) {
  const plan = loadPreparation(prepared);
  if (receiptPath) {
    const receipt = JSON.parse(readFileSync(receiptPath));
    assert.equal(
      plan.sourceSha,
      receipt.sourceSha,
      "Mirror plan source differs from the accepted receipt",
    );
    assert.equal(
      plan.sourceFingerprint,
      receipt.fingerprint,
      "Mirror plan fingerprint differs from the accepted receipt",
    );
    assert.equal(
      plan.version,
      receipt.versions.semver,
      "Mirror plan version differs from the accepted receipt",
    );
    assert.equal(plan.channel, receipt.channel);
  }
  const work = mkdtempSync(
    join(process.env.RUNNER_TEMP ?? dirname(prepared), "php-mirror-"),
  );
  const mainHead = remoteRef(work, remote, "refs/heads/main");
  git(work, ["init", "-q", "-b", "main"]);
  if (mainHead)
    (git(work, [
      "fetch",
      "-q",
      remote,
      "refs/heads/main:refs/remotes/origin/main",
    ]),
      git(work, ["checkout", "-q", "-B", "main", "origin/main"]));
  const tag = plan.proposedTag ? `refs/tags/${plan.proposedTag}` : null;
  if (tag) {
    const existing = remoteRef(work, remote, tag);
    if (existing) {
      git(work, ["fetch", "-q", remote, `${tag}:${tag}`]);
      const tree = mkdtempSync(join(work, "..", "php-tag-"));
      execFileSync(
        "sh",
        ["-c", `git archive "$1" | tar -x -C "$2"`, "sh", existing, tree],
        { cwd: work },
      );
      assert.deepEqual(
        files(tree),
        plan.files,
        `${plan.proposedTag} already exists with different contents; refusing to move it`,
      );
      return { state: "already-published", commit: existing };
    }
  }
  if (
    mainHead &&
    JSON.stringify(files(work)) === JSON.stringify(plan.files) &&
    git(work, ["log", "-1", "--format=%B"]).includes(
      `Accepted source: ${plan.sourceSha}`,
    )
  ) {
    if (tag) git(work, ["push", "-q", remote, `HEAD:${tag}`]);
    return { state: "already-published", commit: mainHead };
  }
  for (const name of readdirSync(work))
    if (name !== ".git") rmSync(join(work, name), { recursive: true });
  const source = join(prepared, plan.sourceDirectory);
  for (const name of Object.keys(plan.files)) {
    mkdirSync(dirname(join(work, name)), { recursive: true });
    writeFileSync(join(work, name), readFileSync(join(source, name)));
  }
  assert.deepEqual(files(work), plan.files);
  const identity = [
    "-c",
    "user.name=Polymorfa SDK release",
    "-c",
    "user.email=sdk-release@polymorfa.com",
  ];
  git(work, ["add", "--all"]);
  git(work, [
    ...identity,
    "commit",
    "-q",
    "--allow-empty",
    "-m",
    `polymorfa/sdk ${plan.version}`,
    "-m",
    `Accepted source: ${plan.sourceSha}\nArchive sha256: ${plan.archiveSha256}`,
  ]);
  const commit = git(work, ["rev-parse", "HEAD"]);
  // A plain push is a fast-forward only; Git refuses if main moved meanwhile.
  git(work, ["push", "-q", remote, "HEAD:refs/heads/main"]);
  if (tag) {
    git(work, [
      ...identity,
      "tag",
      "-a",
      plan.proposedTag,
      "-m",
      `polymorfa/sdk ${plan.version} from ${plan.sourceSha}`,
    ]);
    git(work, ["push", "-q", remote, `${tag}:${tag}`]);
  }
  assert.equal(remoteRef(work, remote, "refs/heads/main"), commit);
  return { state: "published", commit };
}

export async function verify(
  prepared,
  commit,
  base = process.env.PACKAGIST_BASE ?? "https://repo.packagist.org",
) {
  const plan = loadPreparation(prepared);
  const stable = Boolean(plan.proposedTag);
  for (let attempt = 0; attempt < 60; attempt++) {
    const response = await fetch(
      `${base}/p2/polymorfa/sdk${stable ? "" : "~dev"}.json`,
      { redirect: "error", signal: AbortSignal.timeout(30_000) },
    );
    if (response.status === 200) {
      const versions =
        (await response.json()).packages?.["polymorfa/sdk"] ?? [];
      const wanted = stable ? plan.version : plan.composerBranchVersion;
      const entry = versions.find(
        (v) => v.version === wanted || v.version === `v${wanted}`,
      );
      if (entry?.source?.reference === commit) return true;
    }
    await new Promise((done) => setTimeout(done, 10_000));
  }
  throw new Error("Packagist does not reference the published mirror commit");
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, prepared, value] = process.argv.slice(2);
  if (command === "push")
    console.log(JSON.stringify(push(resolve(prepared), value)));
  else if (command === "verify")
    console.log(await verify(resolve(prepared), value));
  else throw new Error("Use push or verify");
}
