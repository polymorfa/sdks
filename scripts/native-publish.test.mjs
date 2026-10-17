// Planner and publisher behavior against recording registry substitutes.
// No real registry is contacted; these tests prove control flow only.
import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { execFileSync, spawn } from "node:child_process";
import { cpSync, mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import {
  cratesAdapter,
  crateUploadBody,
  executeSteps,
  nugetAdapter,
  planNativeRelease,
  pypiAdapter,
  verifyPlan,
} from "./native-publish.mjs";
import { nativePackages } from "./native-packages.mjs";

const scratchRoot = join(
  homedir(),
  ".polymorfa-agent-work/native-publish-tests",
);
mkdirSync(scratchRoot, { recursive: true });
const sha256 = (b) => createHash("sha256").update(b).digest("hex");
const semver = "0.1.0-dev.20261017120000";
function receipt(overrides = {}) {
  return {
    schemaVersion: 1,
    repository: "polymorfa/sdks",
    sourceSha: "a".repeat(40),
    fingerprint: "b".repeat(64),
    channel: "nightly",
    versions: {
      semver,
      python: "0.1.0.dev20261017120000",
      goTag: `packages/go/v${semver}`,
    },
    sourceSdkCommit: "e".repeat(40),
    acceptance: { synthetic: true, result: "passed" },
    ...overrides,
  };
}
// Fake accepted pack directories with the real package names and graph.
function packs(value = receipt()) {
  const dir = mkdtempSync(join(scratchRoot, "packs-"));
  const names = {
    rust: nativePackages.rust.map((p) => `${p.name}-${semver}.crate`),
    dotnet: nativePackages.dotnet.map((p) => `${p.name}.${semver}.nupkg`),
    python: [
      `polymorfa_sdk-${value.versions.python}-py3-none-any.whl`,
      `polymorfa_sdk-${value.versions.python}.tar.gz`,
    ],
    php: ["polymorfa-sdk.tar"],
    go: [`polymorfa-go-${semver}.tar`],
  };
  for (const [language, files] of Object.entries(names)) {
    mkdirSync(join(dir, language));
    writeFileSync(
      join(dir, language, "release-contract.json"),
      JSON.stringify(value),
    );
    for (const file of files)
      writeFileSync(join(dir, language, file), `${language}/${file}`);
  }
  return dir;
}

test("plan orders every public package after its dependencies and binds hashes", () => {
  const dir = packs();
  const plan = planNativeRelease(dir, receipt());
  const ids = plan.steps.map((s) => s.id);
  assert.equal(plan.steps.length, 1 + 1 + 1 + 3 + 10);
  for (const step of plan.steps)
    for (const dep of step.dependsOn)
      assert.ok(
        ids.indexOf(dep) < ids.indexOf(step.id),
        `${step.id} precedes ${dep}`,
      );
  assert.deepEqual(
    plan.steps.find((s) => s.id === "nuget:Polymorfa.Storage.LibSql").dependsOn,
    ["nuget:Polymorfa.Storage.Sql"],
  );
  assert.equal(
    plan.steps.find((s) => s.id === "pypi:polymorfa-sdk").artifacts.length,
    2,
  );
  assert.equal(
    plan.steps.find((s) => s.registry === "go").version,
    `packages/go/v${semver}`,
  );
  verifyPlan(plan, dir, receipt());
});

test("stale, mismatched or tampered acceptance prevents any publisher effect", () => {
  const dir = packs();
  const plan = planNativeRelease(dir, receipt());
  for (const changed of [
    receipt({ sourceSha: "c".repeat(40) }),
    receipt({ acceptance: { synthetic: true, result: "failed" } }),
    receipt({ fingerprint: "d".repeat(64) }),
  ])
    assert.throws(() => verifyPlan(plan, dir, changed), /differs/);
  assert.throws(
    () => planNativeRelease(dir, receipt({ channel: "stable" })),
    /channel/,
  );
  assert.throws(
    () =>
      planNativeRelease(
        packs(receipt({ sourceSha: "c".repeat(40) })),
        receipt(),
      ),
    /different receipt/,
  );
  writeFileSync(join(dir, "rust", `polymorfa-sdk-${semver}.crate`), "tampered");
  assert.throws(
    () => verifyPlan(plan, dir, receipt()),
    /differs from the plan/,
  );
});

test("registry CLI verifies its downloaded packages without requiring other registries", async () => {
  const all = packs();
  const value = receipt();
  const plan = planNativeRelease(all, value);
  const dir = mkdtempSync(join(scratchRoot, "registry-job-"));
  cpSync(join(all, "python"), join(dir, "python"), { recursive: true });
  const planPath = join(dir, "plan.json");
  const receiptPath = join(dir, "receipt.json");
  writeFileSync(planPath, JSON.stringify(plan));
  writeFileSync(receiptPath, JSON.stringify(value));
  const registry = await serve((req, res) => {
    res.statusCode = 404;
    res.end("{}");
  });
  try {
    const child = spawn(
      process.execPath,
      ["scripts/native-publish.mjs", "check", "pypi", planPath],
      {
        env: {
          ...process.env,
          RELEASE_PACKS: dir,
          RELEASE_RECEIPT: receiptPath,
          PYPI_BASE: registry.base,
        },
      },
    );
    let output = "";
    child.stdout.on("data", (chunk) => {
      output += chunk;
    });
    child.stderr.on("data", (chunk) => {
      output += chunk;
    });
    const code = await new Promise((resolve, reject) => {
      child.on("error", reject);
      child.on("close", resolve);
    });
    assert.equal(code, 0, output);
    assert.equal(registry.requests.length, 1);
    assert.ok(registry.requests.every((r) => r.method === "GET"));
  } finally {
    registry.close();
  }
});

function recorder(states) {
  const calls = [];
  return {
    calls,
    adapter: {
      async existing(step) {
        calls.push(["existing", step.id]);
        return typeof states[step.id] === "function"
          ? states[step.id]()
          : (states[step.id] ?? "absent");
      },
      async publish(step) {
        calls.push(["publish", step.id]);
        if (states[`fail:${step.id}`]) throw new Error("registry unavailable");
        states[step.id] = "same";
      },
      async verify(step) {
        calls.push(["verify", step.id]);
        return states[step.id] === "same";
      },
    },
  };
}
const crateSteps = () =>
  planNativeRelease(packs(), receipt()).steps.filter(
    (s) => s.registry === "crates",
  );

test("dependency failure stops dependents and never replays an uncertain write", async () => {
  const states = { "fail:crates:polymorfa-storage-core": true };
  const { calls, adapter } = recorder(states);
  const results = await executeSteps(crateSteps(), adapter, { log: () => {} });
  assert.deepEqual(
    results.map((r) => r.state),
    ["failed", "blocked", "blocked"],
  );
  assert.deepEqual(
    calls.filter((c) => c[0] === "publish").map((c) => c[1]),
    ["crates:polymorfa-storage-core"],
  );
});

test("an upload error whose bytes did land is confirmed, not republished", async () => {
  let landed = false;
  const states = {
    "crates:polymorfa-storage-core": () => (landed ? "same" : "absent"),
  };
  const { calls, adapter } = recorder(states);
  adapter.publish = async (step) => {
    calls.push(["publish", step.id]);
    if (step.id === "crates:polymorfa-storage-core") {
      landed = true;
      throw new Error("connection reset after upload");
    }
    states[step.id] = "same";
  };
  adapter.verify = async (step) =>
    step.id === "crates:polymorfa-storage-core"
      ? landed
      : states[step.id] === "same";
  const results = await executeSteps(crateSteps(), adapter, { log: () => {} });
  assert.deepEqual(
    results.map((r) => r.state),
    ["published", "published", "published"],
  );
  assert.equal(
    calls.filter(
      (c) => c[0] === "publish" && c[1] === "crates:polymorfa-storage-core",
    ).length,
    1,
  );
});

test("existing identical versions resume; different existing versions are never overwritten", async () => {
  const same = recorder({ "crates:polymorfa-storage-core": "same" });
  const resumed = await executeSteps(crateSteps(), same.adapter, {
    log: () => {},
  });
  assert.deepEqual(
    resumed.map((r) => r.state),
    ["already-published", "published", "published"],
  );
  assert.ok(
    !same.calls.some(
      (c) => c[0] === "publish" && c[1] === "crates:polymorfa-storage-core",
    ),
  );
  const different = recorder({ "crates:polymorfa-sdk": "different" });
  await assert.rejects(
    executeSteps(crateSteps(), different.adapter, { log: () => {} }),
    /refusing to overwrite/,
  );
  assert.ok(
    !different.calls.some(
      (c) => c[0] === "publish" && c[1] !== "crates:polymorfa-storage-core",
    ),
  );
  const uncertain = recorder({ "crates:polymorfa-storage-core": "uncertain" });
  await assert.rejects(
    executeSteps(crateSteps(), uncertain.adapter, { log: () => {} }),
    /uncertain/,
  );
  assert.ok(!uncertain.calls.some((c) => c[0] === "publish"));
});

test("dry run records intended publications without effects", async () => {
  const { calls, adapter } = recorder({});
  const results = await executeSteps(crateSteps(), adapter, {
    dryRun: true,
    log: () => {},
  });
  assert.deepEqual(
    results.map((r) => r.state),
    ["would-publish", "would-publish", "would-publish"],
  );
  assert.ok(!calls.some((c) => c[0] === "publish"));
});

async function serve(handler) {
  const requests = [];
  const server = createServer((req, res) => {
    const chunks = [];
    req.on("data", (c) => chunks.push(c));
    req.on("end", () => {
      requests.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: Buffer.concat(chunks),
      });
      handler(req, res, requests.at(-1));
    });
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  return {
    base: `http://127.0.0.1:${server.address().port}`,
    requests,
    close: () => server.close(),
  };
}

test("crates.io adapter uploads the exact accepted bytes and compares checksums", async () => {
  const dir = packs();
  const step = planNativeRelease(dir, receipt()).steps.find(
    (s) => s.id === "crates:polymorfa-storage-core",
  );
  let published = false;
  const registry = await serve((req, res, record) => {
    if (req.method === "PUT") {
      published = true;
      res.end("{}");
    } else if (published)
      res.end(
        JSON.stringify({ version: { checksum: step.artifacts[0].sha256 } }),
      );
    else ((res.statusCode = 404), res.end("{}"));
  });
  process.env.CARGO_REGISTRY_TOKEN = "synthetic-token";
  try {
    const adapter = cratesAdapter(dir, registry.base, () => ({
      name: step.package,
      vers: step.version,
      deps: [],
    }));
    const results = await executeSteps([step], adapter, { log: () => {} });
    assert.deepEqual(
      results.map((r) => r.state),
      ["published"],
    );
    const upload = registry.requests.find((r) => r.method === "PUT");
    assert.equal(upload.url, "/api/v1/crates/new");
    assert.equal(upload.headers.authorization, "synthetic-token");
    const expected = crateUploadBody(
      Buffer.from(`rust/${step.package}-${semver}.crate`),
      { name: step.package, vers: step.version, deps: [] },
    );
    assert.ok(upload.body.equals(expected));
    const bytes = upload.body.subarray(8 + upload.body.readUInt32LE(0));
    assert.equal(sha256(bytes), step.artifacts[0].sha256);
  } finally {
    delete process.env.CARGO_REGISTRY_TOKEN;
    registry.close();
  }
});

test("NuGet adapter pushes the exact package and treats a re-signed copy as identical", async () => {
  const dir = mkdtempSync(join(scratchRoot, "nuget-"));
  mkdirSync(join(dir, "dotnet"));
  const file = join(dir, "dotnet", `Polymorfa.Sdk.${semver}.nupkg`);
  const contents = join(dir, "contents");
  mkdirSync(contents);
  writeFileSync(join(contents, "Polymorfa.Sdk.nuspec"), "<package/>");
  execFileSync("zip", ["-q", "-X", file, "Polymorfa.Sdk.nuspec"], {
    cwd: contents,
  });
  const signed = join(dir, "signed.nupkg");
  writeFileSync(join(contents, ".signature.p7s"), "repository signature");
  execFileSync(
    "zip",
    ["-q", "-X", signed, "Polymorfa.Sdk.nuspec", ".signature.p7s"],
    { cwd: contents },
  );
  const step = {
    id: "nuget:Polymorfa.Sdk",
    package: "Polymorfa.Sdk",
    version: semver,
    dependsOn: [],
    artifacts: [{ file: `dotnet/Polymorfa.Sdk.${semver}.nupkg` }],
  };
  let stored = null;
  const registry = await serve((req, res, record) => {
    if (req.method === "PUT") {
      stored = record;
      res.statusCode = 201;
      res.end();
    } else if (stored) res.end(execFileSync("cat", [signed]));
    else ((res.statusCode = 404), res.end());
  });
  process.env.NUGET_API_KEY = "synthetic-key";
  process.env.RUNNER_TEMP = dir;
  try {
    const adapter = nugetAdapter(
      dir,
      registry.base,
      `${registry.base}/api/v2/package`,
    );
    const results = await executeSteps([step], adapter, { log: () => {} });
    assert.deepEqual(
      results.map((r) => r.state),
      ["published"],
    );
    assert.equal(stored.headers["x-nuget-apikey"], "synthetic-key");
    assert.ok(stored.body.includes(execFileSync("cat", [file])));
    assert.ok(
      registry.requests.some(
        (r) =>
          r.url ===
          `/v3-flatcontainer/polymorfa.sdk/${semver}/polymorfa.sdk.${semver}.nupkg`,
      ),
    );
  } finally {
    delete process.env.NUGET_API_KEY;
    delete process.env.RUNNER_TEMP;
    registry.close();
  }
});

test("NuGet compares the entire large DLL and refuses unreadable packages", async () => {
  const dir = mkdtempSync(join(scratchRoot, "large-nuget-"));
  mkdirSync(join(dir, "dotnet"));
  const contents = join(dir, "contents");
  mkdirSync(contents);
  const file = join(dir, "dotnet", `Polymorfa.Sdk.${semver}.nupkg`);
  const changed = join(dir, "changed.nupkg");
  const dll = Buffer.alloc(4 * 1024 * 1024, 65);
  writeFileSync(join(contents, "Polymorfa.Sdk.dll"), dll);
  execFileSync("zip", ["-q", "-X", file, "Polymorfa.Sdk.dll"], {
    cwd: contents,
  });
  dll[dll.length - 1] = 66;
  writeFileSync(join(contents, "Polymorfa.Sdk.dll"), dll);
  execFileSync("zip", ["-q", "-X", changed, "Polymorfa.Sdk.dll"], {
    cwd: contents,
  });
  let remote = execFileSync("cat", [file]);
  const registry = await serve((req, res) => res.end(remote));
  const step = {
    id: "nuget:Polymorfa.Sdk",
    package: "Polymorfa.Sdk",
    version: semver,
    dependsOn: [],
    artifacts: [{ file: `dotnet/Polymorfa.Sdk.${semver}.nupkg` }],
  };
  const oldTemp = process.env.RUNNER_TEMP;
  process.env.RUNNER_TEMP = dir;
  try {
    const adapter = nugetAdapter(dir, registry.base);
    assert.equal(await adapter.existing(step), "same");
    remote = execFileSync("cat", [changed]);
    assert.equal(await adapter.existing(step), "different");
    remote = Buffer.from("invalid zip");
    await assert.rejects(adapter.existing(step), /unzip|package/i);
  } finally {
    if (oldTemp === undefined) delete process.env.RUNNER_TEMP;
    else process.env.RUNNER_TEMP = oldTemp;
    registry.close();
  }
});

test("PyPI digests refuse different existing files and confirm uploads", async () => {
  const dir = packs();
  const step = planNativeRelease(dir, receipt()).steps.find(
    (s) => s.registry === "pypi",
  );
  const files = step.artifacts.map((a) => ({
    filename: a.file.split("/")[1],
    digests: { sha256: a.sha256 },
  }));
  let mode = "absent";
  const registry = await serve((req, res) => {
    if (mode === "absent") return ((res.statusCode = 404), res.end("{}"));
    const urls =
      mode === "different"
        ? [{ ...files[0], digests: { sha256: "0".repeat(64) } }]
        : mode === "partial"
          ? [files[0]]
          : files;
    res.end(JSON.stringify({ urls }));
  });
  try {
    const adapter = pypiAdapter(dir, registry.base);
    assert.equal(await adapter.existing(step), "absent");
    mode = "partial";
    assert.equal(await adapter.existing(step), "absent");
    mode = "different";
    assert.equal(await adapter.existing(step), "different");
    mode = "same";
    assert.equal(await adapter.verify(step), true);
  } finally {
    registry.close();
  }
});
