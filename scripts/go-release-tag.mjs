// Go has no upload registry: a module version is a Git tag. The accepted Go
// release is a tag-only commit whose parent is the accepted main source and
// whose only changes are the generated version stamp and release receipt.
//
// prepare <receipt> <out.json>  create the local commit and tag, prove the module zip
// push <prepared.json>          push only the tag; never force or move an existing tag
// verify <prepared.json>        require proxy.golang.org to serve the same module hash
//
// No branch is created or updated. Tag credentials come from the environment
// (GO_TAG_TOKEN) through Git configuration variables, never command arguments.
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { validateReceipt } from "./native-publish.mjs";

const root = resolve(import.meta.dirname, "..");
export const modulePath = "github.com/polymorfa/sdks/packages/go";
export const stampAllowlist = [
  "packages/go/calls_diagnostics.go",
  "packages/go/release-contract.json",
  "packages/go/transport.go",
];
const git = (args, options = {}) =>
  execFileSync("git", args, { cwd: root, encoding: "utf8", ...options }).trim();
const sha256 = (bytes) => createHash("sha256").update(bytes).digest("hex");

// Downloads the tagged module through the Go command from a local repository,
// exactly as the proxy would build it from GitHub, and returns its hash and zip.
export function moduleZip(repository, version, scratch) {
  const config = join(scratch, "gitconfig");
  writeFileSync(
    config,
    `[url "file://${repository}"]\n\tinsteadOf = https://github.com/polymorfa/sdks\n[protocol "file"]\n\tallow = always\n`,
  );
  const env = {
    PATH: process.env.PATH,
    HOME: scratch,
    GIT_CONFIG_GLOBAL: config,
    GIT_CONFIG_NOSYSTEM: "1",
    GOPROXY: "direct",
    GONOSUMDB: modulePath,
    GONOSUMCHECK: "1",
    GOPRIVATE: modulePath,
    GOFLAGS: "-modcacherw",
    GOMODCACHE: join(scratch, "modcache"),
    GOCACHE: join(scratch, "gocache"),
    GOTOOLCHAIN: "local",
  };
  const result = spawnSync(
    "go",
    ["mod", "download", "-json", `${modulePath}@v${version}`],
    { cwd: scratch, env, encoding: "utf8" },
  );
  assert.equal(
    result.status,
    0,
    `Go module download failed: ${result.stdout}${result.stderr}`,
  );
  const info = JSON.parse(result.stdout);
  assert.equal(info.Version, `v${version}`);
  return { sum: info.Sum, zip: info.Zip };
}

export function inspectModuleZip(zip, version, receipt) {
  const prefix = `${modulePath}@v${version}/`;
  const names = execFileSync("unzip", ["-Z1", zip], { encoding: "utf8" })
    .split("\n")
    .filter(Boolean);
  assert.ok(
    names.every((n) => n.startsWith(prefix)),
    "Module zip has an unexpected root",
  );
  const read = (name) =>
    execFileSync("unzip", ["-p", zip, prefix + name], {
      maxBuffer: 16 * 1024 * 1024,
    });
  assert.equal(
    /const Version = "([^"]+)"/.exec(read("transport.go").toString())?.[1],
    version,
    "Module zip lacks the stamped version",
  );
  assert.deepEqual(
    JSON.parse(read("release-contract.json")),
    receipt,
    "Module zip lacks the accepted receipt",
  );
  assert.ok(names.includes(prefix + "go.mod"));
  return names.length;
}

export function prepare(receiptPath, out) {
  const receipt = validateReceipt(JSON.parse(readFileSync(receiptPath)));
  const version = receipt.versions.semver;
  const tag = receipt.versions.goTag;
  assert.equal(
    git(["rev-parse", "HEAD"]),
    receipt.sourceSha,
    "Checkout must be the accepted source",
  );
  assert.equal(
    git(["status", "--porcelain"]),
    "",
    "Accepted source must be clean",
  );
  assert.equal(
    spawnSync("git", ["rev-parse", "-q", "--verify", `refs/tags/${tag}`], {
      cwd: root,
    }).status,
    1,
    "Tag already exists locally",
  );
  execFileSync("node", [join(root, "scripts/stamp-native-release.mjs"), "go"], {
    cwd: root,
    stdio: "inherit",
    env: { ...process.env, RELEASE_OUTPUT: resolve(receiptPath, "..") },
  });
  git(["add", "--force", "--", ...stampAllowlist]);
  const changed = git(["diff", "--cached", "--name-only"])
    .split("\n")
    .filter(Boolean)
    .sort();
  assert.deepEqual(
    changed,
    stampAllowlist,
    `Release commit may change only ${stampAllowlist.join(", ")}`,
  );
  assert.equal(
    git(["status", "--porcelain", "--untracked-files=no"])
      .split("\n")
      .filter((l) => !l.startsWith("M  ") && !l.startsWith("A  "))
      .join(""),
    "",
    "Unexpected unstaged changes",
  );
  const identity = [
    "-c",
    "user.name=Polymorfa SDK release",
    "-c",
    "user.email=sdk-release@polymorfa.com",
  ];
  const receiptSha = sha256(
    readFileSync(join(root, "packages/go/release-contract.json")),
  );
  git([
    ...identity,
    "commit",
    "--no-verify",
    "-m",
    `Go module release ${version}`,
    "-m",
    `Accepted source: ${receipt.sourceSha}\nRelease receipt sha256: ${receiptSha}`,
  ]);
  const releaseCommit = git(["rev-parse", "HEAD"]);
  assert.equal(
    git(["rev-parse", "HEAD^"]),
    receipt.sourceSha,
    "Release commit must be a direct child of the accepted source",
  );
  git([
    ...identity,
    "tag",
    "-a",
    tag,
    "-m",
    `Go module ${version} from accepted source ${receipt.sourceSha}`,
  ]);
  const scratch = mkdtempSync(
    join(process.env.RUNNER_TEMP ?? resolve(root, ".release"), "go-module-"),
  );
  const module = moduleZip(root, version, scratch);
  const files = inspectModuleZip(module.zip, version, receipt);
  const prepared = {
    schemaVersion: 1,
    module: modulePath,
    version: `v${version}`,
    tag,
    sourceSha: receipt.sourceSha,
    releaseCommit,
    receiptSha256: receiptSha,
    sum: module.sum,
    zipSha256: sha256(readFileSync(module.zip)),
    files,
    publication: "not performed",
  };
  writeFileSync(out, JSON.stringify(prepared, null, 2) + "\n");
  return prepared;
}

// Reads the remote tag. Returns null when absent, otherwise the peeled commit.
export function remoteTag(remote, tag) {
  const lines = git([
    "ls-remote",
    "--tags",
    remote,
    `refs/tags/${tag}`,
    `refs/tags/${tag}^{}`,
  ])
    .split("\n")
    .filter(Boolean);
  if (!lines.length) return null;
  const peeled = lines.find((l) => l.endsWith("^{}")) ?? lines[0];
  return peeled.split(/\s+/)[0];
}

export function push(prepared, remote = "origin") {
  assert.equal(
    git(["rev-parse", `refs/tags/${prepared.tag}^{commit}`]),
    prepared.releaseCommit,
    "Local tag differs from the prepared release",
  );
  const authEnv = process.env.GO_TAG_TOKEN
    ? {
        GIT_CONFIG_COUNT: "1",
        GIT_CONFIG_KEY_0: "http.https://github.com/.extraheader",
        GIT_CONFIG_VALUE_0: `AUTHORIZATION: basic ${Buffer.from(`x-access-token:${process.env.GO_TAG_TOKEN}`).toString("base64")}`,
      }
    : {};
  const options = { env: { ...process.env, ...authEnv } };
  const existing = remoteTag(remote, prepared.tag);
  if (existing !== null) {
    assert.equal(
      existing,
      prepared.releaseCommit,
      `${prepared.tag} already exists at a different commit; refusing to move it`,
    );
    return "already-published";
  }
  // Push only the tag ref. Without --force Git refuses to replace a tag that
  // appeared concurrently.
  git(
    ["push", remote, `refs/tags/${prepared.tag}:refs/tags/${prepared.tag}`],
    options,
  );
  assert.equal(remoteTag(remote, prepared.tag), prepared.releaseCommit);
  return "published";
}

export async function verify(
  prepared,
  proxy = process.env.GOPROXY_URL ?? "https://proxy.golang.org",
) {
  const escaped = modulePath.replace(/[A-Z]/g, (c) => "!" + c.toLowerCase());
  for (let attempt = 0; attempt < 30; attempt++) {
    const response = await fetch(
      `${proxy}/${escaped}/@v/${prepared.version}.info`,
      { redirect: "error", signal: AbortSignal.timeout(30_000) },
    );
    if (response.status === 200) break;
    await new Promise((done) => setTimeout(done, 10_000));
  }
  const scratch = mkdtempSync(
    join(process.env.RUNNER_TEMP ?? resolve(root, ".release"), "go-proxy-"),
  );
  const result = spawnSync(
    "go",
    ["mod", "download", "-json", `${modulePath}@${prepared.version}`],
    {
      cwd: scratch,
      encoding: "utf8",
      env: {
        PATH: process.env.PATH,
        HOME: scratch,
        GOPROXY: proxy,
        GOMODCACHE: join(scratch, "modcache"),
        GOCACHE: join(scratch, "gocache"),
        GOFLAGS: "-modcacherw",
        GOTOOLCHAIN: "local",
      },
    },
  );
  assert.equal(result.status, 0, "The Go proxy does not serve the release");
  assert.equal(
    JSON.parse(result.stdout).Sum,
    prepared.sum,
    "The Go proxy serves different module contents",
  );
  return true;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const [command, input, out] = process.argv.slice(2);
  if (command === "prepare")
    console.log(JSON.stringify(prepare(resolve(input), resolve(out))));
  else if (command === "push")
    console.log(
      push(
        JSON.parse(readFileSync(input)),
        process.env.GO_TAG_REMOTE ?? "origin",
      ),
    );
  else if (command === "verify")
    console.log(await verify(JSON.parse(readFileSync(input))));
  else throw new Error("Use prepare, push or verify");
}
