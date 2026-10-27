import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { format } from "prettier";
import { extractOperations } from "./check-coverage.mjs";

const [repository, revision] = process.argv.slice(2);
if (!repository || !/^[0-9a-f]{40}$/.test(revision ?? ""))
  throw new Error(
    "Usage: sync-feature-evaluation-contract <monorepo-path> <full-commit-SHA>",
  );

const families = {
  messaging: {
    sourcePath: "apps/api/docs/openapi.json",
    operationIds: ["evaluateFeatures"],
  },
  platform: {
    sourcePath: "apps/api/docs/openapi.management.json",
    operationIds: [
      "evaluateAccountFeatures",
      "setFeatureEnrollment",
      "recordFeatureExposure",
    ],
  },
};
const methods = new Set(["get", "post", "put", "patch", "delete"]);
const ledger = JSON.parse(
  readFileSync(new URL("../contracts/coverage.json", import.meta.url), "utf8"),
);

const sources = {};
const operations = [];
for (const [family, { sourcePath, operationIds }] of Object.entries(families)) {
  const bytes = execFileSync(
    "git",
    ["-C", repository, "show", `${revision}:${sourcePath}`],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const source = JSON.parse(bytes);
  const wanted = new Set(operationIds);
  const paths = {};
  for (const [path, item] of Object.entries(source.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!methods.has(method) || !wanted.has(operation?.operationId)) continue;
      paths[path] ??= Object.fromEntries(
        Object.entries(item).filter(([key]) => !methods.has(key)),
      );
      paths[path][method] = operation;
      wanted.delete(operation.operationId);
    }
  }
  if (wanted.size)
    throw new Error(`Missing ${family} operations: ${[...wanted].join(", ")}`);

  const components = {};
  const pending = [paths];
  while (pending.length) {
    const value = pending.pop();
    if (Array.isArray(value)) pending.push(...value);
    else if (value && typeof value === "object") {
      for (const [key, child] of Object.entries(value)) {
        if (
          key === "$ref" &&
          typeof child === "string" &&
          child.startsWith("#/components/")
        ) {
          const [, , category, name] = child.split("/");
          components[category] ??= {};
          if (!components[category][name]) {
            const resolved = source.components?.[category]?.[name];
            if (!resolved)
              throw new Error(`Unresolved source reference ${child}`);
            components[category][name] = resolved;
            pending.push(resolved);
          }
        } else pending.push(child);
      }
    }
  }

  // Fingerprints come from the full source file; the test proves the stored
  // subset reproduces them.
  const subset = { paths, components };
  const extracted = new Map(
    extractOperations(family, subset).map((operation) => [
      operation.operationId,
      operation,
    ]),
  );
  for (const operation of extractOperations(family, source)) {
    if (!operationIds.includes(operation.operationId)) continue;
    if (
      extracted.get(operation.operationId)?.fingerprint !==
      operation.fingerprint
    )
      throw new Error(`Incomplete extraction for ${operation.operationId}`);
    const row = ledger.operations.find(
      (entry) =>
        entry.family === family &&
        entry.method === operation.method &&
        entry.path === operation.path,
    );
    if (!row) throw new Error(`No ledger row for ${operation.operationId}`);
    operations.push({ ...operation, typescript: row.typescript });
  }
  sources[family] = {
    sourcePath,
    sourceSha256: createHash("sha256").update(bytes).digest("hex"),
    paths,
    components,
  };
}

const contract = {
  repository: "polymorfa/polymorfa",
  commit: revision,
  branch: "dev",
  note: "Feature availability operations from API dev. The full snapshots and coverage.json stay pinned to contracts/source.json until the next repin.",
  extraction:
    "Feature availability operations and their transitive component references; operation objects unchanged",
  sources,
  operations,
};
writeFileSync(
  new URL("../contracts/feature-evaluation.json", import.meta.url),
  await format(JSON.stringify(contract), { parser: "json" }),
);
