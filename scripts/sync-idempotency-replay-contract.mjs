import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";

const [repository, revision] = process.argv.slice(2);
if (!repository || !/^[0-9a-f]{40}$/.test(revision ?? "")) {
  throw new Error(
    "Usage: sync-idempotency-replay-contract <monorepo-path> <full-commit-SHA>",
  );
}
const actual = execFileSync(
  "git",
  ["-C", repository, "rev-parse", `${revision}^{commit}`],
  { encoding: "utf8" },
).trim();
if (actual !== revision)
  throw new Error("Source must be the exact recorded commit");
const sources = [];
const errorCodes = new Set();
const operations = [];
for (const path of [
  "apps/api/docs/openapi.json",
  "apps/api/docs/openapi.management.json",
]) {
  const bytes = execFileSync(
    "git",
    ["-C", repository, "show", `${revision}:${path}`],
    { maxBuffer: 32 * 1024 * 1024 },
  );
  const document = JSON.parse(bytes);
  const schemas = document.components?.schemas ?? {};
  const codes = Object.values(schemas).flatMap(
    (schema) => schema?.properties?.error?.properties?.code?.enum ?? [],
  );
  for (const code of codes)
    if (code.startsWith("idempotency_")) errorCodes.add(code);
  sources.push({
    path,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    info: document.info,
  });
  for (const [route, item] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(item)) {
      if (!operation || typeof operation !== "object" || !operation.operationId)
        continue;
      const parameter = operation.parameters?.find(
        (entry) => entry.name === "Idempotency-Key" && entry.in === "header",
      );
      if (!parameter?.description?.includes("1 hour")) continue;
      operations.push({
        sourcePath: path,
        path: route,
        method: method.toUpperCase(),
        operationId: operation.operationId,
        idempotencyParameter: parameter,
      });
    }
  }
}
if (
  !errorCodes.has("idempotency_replay_unavailable") ||
  operations.length === 0
)
  throw new Error("Source does not contain the response-replay contract");
const contract = {
  schemaVersion: 1,
  repository: "polymorfa/polymorfa",
  sourceCommit: revision,
  sources,
  errorCodes: [...errorCodes].sort(),
  operations,
  extraction:
    "Idempotency error enums and unchanged one-hour header parameters from committed generated API documents; the baseline snapshots are unchanged",
  published: false,
};
writeFileSync(
  new URL("../contracts/idempotency-replay.json", import.meta.url),
  JSON.stringify(contract, null, 2) + "\n",
);
console.log(
  `Wrote the replay supplement from ${operations.length} source operations`,
);
