#!/usr/bin/env node
// Prepares and packs npm dev prereleases for the public workspace packages.
//
//   node scripts/dev-release.mjs version                 # print the next dev version
//   node scripts/dev-release.mjs pack --version V --out DIR
//
// `pack` rewrites every public package version to V, pins internal
// dependency and peer ranges to exactly V, packs each package into DIR in
// dependency order, verifies the tarball manifests, and writes
// DIR/manifest.json listing the tarballs in publish order. It edits the
// package.json files in place; run it on a disposable checkout (CI) or
// restore them with `git checkout -- packages/*/package.json` afterwards.
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const rootManifest = JSON.parse(
  readFileSync(join(root, "package.json"), "utf8"),
);
const depFields = ["dependencies", "peerDependencies", "optionalDependencies"];

// Files each tarball must contain, beyond package.json.
const requiredFiles = {
  "@polymorfa/sdk": [
    "dist/index.js",
    "dist/index.d.ts",
    "dist/node.js",
    "dist/node.d.ts",
    "dist/calls/index.js",
    "dist/calls/index.d.ts",
    "dist/calls/internal.js",
  ],
};

function fail(message) {
  console.error(`dev-release: ${message}`);
  process.exit(1);
}

function arg(name) {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

function loadPackages() {
  const all = rootManifest.workspaces.map((dir) => {
    const file = join(root, dir, "package.json");
    return { dir, file, json: JSON.parse(readFileSync(file, "utf8")) };
  });
  const names = new Set(all.map((p) => p.json.name));
  const pub = all.filter((p) => !p.json.private);
  const pubNames = new Set(pub.map((p) => p.json.name));
  for (const p of pub) {
    for (const field of depFields) {
      for (const dep of Object.keys(p.json[field] ?? {})) {
        if (names.has(dep) && !pubNames.has(dep)) {
          fail(`${p.json.name} ${field} names private workspace ${dep}`);
        }
      }
    }
  }
  return { pub, pubNames };
}

// Kahn's algorithm over internal dependencies, stable by workspace order.
function publishOrder(pub, pubNames) {
  const deps = new Map(
    pub.map((p) => [
      p.json.name,
      new Set(
        depFields
          .flatMap((f) => Object.keys(p.json[f] ?? {}))
          .filter((d) => pubNames.has(d)),
      ),
    ]),
  );
  const order = [];
  const remaining = [...pub];
  while (remaining.length > 0) {
    const index = remaining.findIndex((p) =>
      [...deps.get(p.json.name)].every((d) =>
        order.some((o) => o.json.name === d),
      ),
    );
    if (index === -1) fail("internal dependency cycle");
    order.push(...remaining.splice(index, 1));
  }
  return order;
}

function baseVersion() {
  const sdk = JSON.parse(
    readFileSync(join(root, "packages/typescript/package.json"), "utf8"),
  );
  const match = /^(\d+\.\d+\.\d+)(?:-.*)?$/.exec(sdk.version);
  if (!match) fail(`cannot parse @polymorfa/sdk version ${sdk.version}`);
  return match[1];
}

// 0.1.0-dev.<UTC YYYYMMDDHHmmss>. A single numeric identifier compares
// numerically under semver, so later runs always sort higher, independent
// of workflow run numbers, reruns, or renames.
function nextVersion(date = new Date()) {
  const stamp = date.toISOString().replace(/\D/g, "").slice(0, 14);
  return `${baseVersion()}-dev.${stamp}`;
}

function pack(version, out) {
  if (!/^\d+\.\d+\.\d+-dev\.[1-9]\d*$/.test(version)) {
    fail(`version ${version} does not match <x.y.z>-dev.<number>`);
  }
  const { pub, pubNames } = loadPackages();
  const order = publishOrder(pub, pubNames);
  for (const p of order) {
    p.json.version = version;
    for (const field of depFields) {
      for (const dep of Object.keys(p.json[field] ?? {})) {
        if (pubNames.has(dep)) p.json[field][dep] = version;
      }
    }
    writeFileSync(p.file, `${JSON.stringify(p.json, null, 2)}\n`);
  }

  mkdirSync(out, { recursive: true });
  const manifest = [];
  for (const p of order) {
    const result = JSON.parse(
      execFileSync(
        "npm",
        [
          "pack",
          "--json",
          "--ignore-scripts",
          "--pack-destination",
          out,
          "-w",
          p.json.name,
        ],
        { cwd: root, encoding: "utf8" },
      ),
    )[0];
    const tarball = join(out, result.filename);
    const packed = JSON.parse(
      execFileSync("tar", ["-xzOf", tarball, "package/package.json"], {
        encoding: "utf8",
      }),
    );
    if (packed.version !== version)
      fail(`${p.json.name} packed version ${packed.version}`);
    for (const field of depFields) {
      for (const [dep, range] of Object.entries(packed[field] ?? {})) {
        if (dep.startsWith("@polymorfa/") && range !== version) {
          fail(
            `${p.json.name} ${field}.${dep} is ${range}, expected ${version}`,
          );
        }
      }
    }
    // npm provenance rejects a package whose repository.url does not match
    // the publishing GitHub repository, so fail here instead of mid-publish.
    const repo = packed.repository;
    if (
      !repo ||
      typeof repo !== "object" ||
      repo.url !== "git+https://github.com/polymorfa/sdks.git" ||
      typeof repo.directory !== "string"
    ) {
      fail(
        `${p.json.name} needs repository { url: "git+https://github.com/polymorfa/sdks.git", directory } for npm provenance`,
      );
    }
    const files = new Set(result.files.map((f) => f.path));
    for (const required of requiredFiles[p.json.name] ?? []) {
      if (!files.has(required))
        fail(`${p.json.name} tarball is missing ${required}`);
    }
    if (![...files].some((f) => f.startsWith("dist/"))) {
      fail(`${p.json.name} tarball has no dist/ files; build before packing`);
    }
    for (const target of Object.values(packed.exports ?? {})) {
      for (const file of typeof target === "string"
        ? [target]
        : Object.values(target)) {
        if (!files.has(file.replace(/^\.\//, ""))) {
          fail(`${p.json.name} export target ${file} is not in the tarball`);
        }
      }
    }
    manifest.push({ name: p.json.name, version, tarball: result.filename });
    console.log(
      `packed ${p.json.name}@${version} (${result.files.length} files)`,
    );
  }
  writeFileSync(
    join(out, "manifest.json"),
    `${JSON.stringify(manifest, null, 2)}\n`,
  );
  const stray = readdirSync(out).filter(
    (f) => f.endsWith(".tgz") && !manifest.some((m) => m.tarball === f),
  );
  if (stray.length > 0)
    fail(`unexpected tarballs in ${out}: ${stray.join(", ")}`);
}

const command = process.argv[2];
if (command === "version") {
  console.log(nextVersion());
} else if (command === "pack") {
  const version = arg("version");
  const out = arg("out");
  if (!version || !out) fail("pack requires --version and --out");
  pack(version, resolve(out));
} else {
  fail("usage: dev-release.mjs version | pack --version V --out DIR");
}
