import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { push } from "./php-mirror-publish.mjs";

test("Composer preview publication preserves mirror main and never creates a stable tag", () => {
  const parent = join(homedir(), ".polymorfa-agent-work/sdk-preview-tests");
  mkdirSync(parent, { recursive: true });
  const dir = mkdtempSync(join(parent, "composer-"));
  const remote = join(dir, "remote.git");
  const seed = join(dir, "seed");
  const git = (cwd, ...args) =>
    execFileSync("git", args, {
      cwd,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    }).trim();
  git(dir, "init", "--bare", "-q", "-b", "main", remote);
  mkdirSync(seed);
  git(seed, "init", "-q", "-b", "main");
  writeFileSync(
    join(seed, "README.md"),
    "Synthetic accepted-channel fixture\n",
  );
  git(seed, "add", "README.md");
  git(
    seed,
    "-c",
    "user.name=SDK test",
    "-c",
    "user.email=sdk-test@example.invalid",
    "commit",
    "-qm",
    "Synthetic accepted channel",
  );
  git(seed, "push", "-q", remote, "HEAD:main");
  const main = git(seed, "rev-parse", "HEAD");
  const prepared = join(dir, "prepared");
  mkdirSync(join(prepared, "source"), { recursive: true });
  const contents = "Synthetic preview fixture\n";
  writeFileSync(join(prepared, "source/README.md"), contents);
  const plan = {
    schemaVersion: 1,
    package: "polymorfa/sdk",
    sourceSha: "a".repeat(40),
    sourceFingerprint: "b".repeat(64),
    version: "0.1.0-preview.20261116120000",
    channel: "preview",
    composerBranchVersion: "dev-preview",
    sourceDirectory: "source",
    archiveSha256: "c".repeat(64),
    files: { "README.md": createHash("sha256").update(contents).digest("hex") },
    publication: "not performed",
  };
  writeFileSync(join(prepared, "mirror-plan.json"), JSON.stringify(plan));
  const result = push(prepared, remote);
  assert.equal(result.state, "published");
  assert.equal(git(remote, "rev-parse", "refs/heads/main"), main);
  assert.equal(git(remote, "rev-parse", "refs/heads/preview"), result.commit);
  assert.equal(git(remote, "tag", "--list"), "");
  assert.equal(push(prepared, remote).state, "already-published");
  writeFileSync(
    join(prepared, "mirror-plan.json"),
    JSON.stringify({ ...plan, proposedTag: "v0.1.0" }),
  );
  assert.throws(() => push(prepared, remote));
});
