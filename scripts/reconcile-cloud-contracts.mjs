#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { extractOperations } from "./check-coverage.mjs";

const [repository, commit] = process.argv.slice(2);
if (!repository || !/^[a-f0-9]{40}$/.test(commit ?? ""))
  throw new Error(
    "Usage: reconcile-cloud-contracts <api-repository> <exact-commit>",
  );
if (commit !== "b61d3198aa242d8cba5705e468d2845dc826bf5b")
  throw new Error(
    "This reviewed migration targets only b61d3198aa242d8cba5705e468d2845dc826bf5b; inspect new contracts before extending it.",
  );
const previous = JSON.parse(readFileSync("contracts/coverage.json", "utf8"));
if (previous.sourceCommit === commit) process.exit(0);
const operations = [],
  audit = [];
const source = { repository: "polymorfa/polymorfa", commit, contracts: {} };
for (const [family, sourcePath] of [
  ["messaging", "apps/api/docs/openapi.json"],
  ["platform", "apps/api/docs/openapi.management.json"],
]) {
  const snapshotPath = `contracts/openapi.${family}.json`;
  const old = JSON.parse(readFileSync(snapshotPath, "utf8"));
  const bytes = execFileSync(
    "git",
    ["-C", repository, "show", `${commit}:${sourcePath}`],
    { maxBuffer: 30_000_000 },
  );
  const next = JSON.parse(bytes);
  for (const operation of extractOperations(family, next)) {
    const matches = previous.operations.filter(
      (row) =>
        row.family === family &&
        row.operationId === operation.operationId &&
        row.method === operation.method,
    );
    const prior = matches.length === 1 ? matches[0] : undefined;
    let typescript;
    let evidence;
    if (prior) {
      const moved = extractOperations(family, {
        ...old,
        paths: { [operation.path]: old.paths[prior.path] },
      }).find((row) => row.method === operation.method);
      const scoped =
        /quicklink|customers/i.test(operation.path) ||
        [
          "voipPlaceCall",
          "voipAcceptCall",
          "voipRejectCall",
          "voipAddParticipant",
          "voipSetMode",
        ].includes(operation.operationId);
      if (
        prior.typescript.status === "excluded" ||
        moved?.fingerprint === operation.fingerprint ||
        scoped
      ) {
        typescript = prior.typescript;
        evidence = scoped
          ? "QuickLink/Customer request methods and serialization tests reviewed"
          : "Existing mapping retained after path-only structural comparison or credential exclusion review";
      } else {
        typescript = {
          ...prior.typescript,
          status: "partial",
          reason:
            "The handwritten method exists, but the new contract changes request identity or response/error schemas; full reconciliation outside the Cloud/QuickLink scope remains unverified.",
          milestone: "current-contract-reconciliation",
        };
        evidence =
          "Changed shape is explicitly partial, not inherited coverage";
      }
    } else if (operation.operationId === "embeddedSignup") {
      typescript = {
        status: "covered",
        method: "MessagingClient.cloudOnboarding.advance",
      };
      evidence = "Typed Cloud resource and exact request/credential tests";
    } else if (
      /^\/(quicklink|api\/account|api\/admin|admin)\//.test(operation.path)
    ) {
      typescript = {
        status: "excluded",
        reason:
          "Hosted invitation, dashboard identity, or staff-only credential boundary; not a server SDK credential resource.",
        milestone: "not-server-sdk",
      };
      evidence = "Owning route credential boundary inspected";
    } else {
      typescript = {
        status: "missing",
        reason:
          "No reviewed handwritten SDK method implements this newly added operation.",
        milestone: "current-contract-reconciliation",
      };
      evidence = "New operation remains an explicit gap";
    }
    operations.push({ ...operation, typescript });
    audit.push({
      operationId: operation.operationId,
      method: operation.method,
      path: operation.path,
      previousPath: prior?.path ?? null,
      status: typescript.status,
      evidence,
    });
  }
  writeFileSync(snapshotPath, bytes);
  source.contracts[family] = {
    sourcePath,
    snapshotPath,
    sha256: createHash("sha256").update(bytes).digest("hex"),
  };
}
const removed = previous.operations
  .filter(
    (prior) =>
      !operations.some(
        (row) =>
          row.family === prior.family &&
          row.method === prior.method &&
          row.operationId === prior.operationId,
      ),
  )
  .map(({ family, method, path, operationId }) => ({
    family,
    method,
    path,
    operationId,
  }));
writeFileSync(
  "contracts/coverage.json",
  JSON.stringify({ ...previous, sourceCommit: commit, operations }, null, 2) +
    "\n",
);
writeFileSync("contracts/source.json", JSON.stringify(source, null, 2) + "\n");
writeFileSync(
  "contracts/cloud-reconciliation.json",
  JSON.stringify(
    {
      sourceCommit: commit,
      previousSourceCommit: previous.sourceCommit,
      operations: audit,
      removed,
    },
    null,
    2,
  ) + "\n",
);
