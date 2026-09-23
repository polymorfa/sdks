import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { writeFileSync } from "node:fs";
import { format } from "prettier";
import { extractOperations } from "./check-coverage.mjs";
const [repository, revision] = process.argv.slice(2);
if (!repository || !/^[0-9a-f]{40}$/.test(revision ?? ""))
  throw new Error(
    "Usage: sync-functions-contract <monorepo-path> <full-commit-SHA>",
  );
const sourcePath = "apps/api/docs/openapi.management.json";
const sourceBytes = execFileSync(
  "git",
  ["-C", repository, "show", `${revision}:${sourcePath}`],
  { maxBuffer: 16 * 1024 * 1024 },
);
const source = JSON.parse(sourceBytes);
const document = {
  ...source,
  info: {
    ...source.info,
    title: "Polymorfa Functions API contract subset",
    description:
      "Functions operations and transitive schemas from the recorded source revision.",
  },
  paths: Object.fromEntries(
    Object.entries(source.paths).filter(([path]) =>
      path.startsWith("/platform/functions"),
    ),
  ),
  components: { securitySchemes: source.components.securitySchemes },
};
const pending = [document.paths, document.components];
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
        document.components[category] ??= {};
        if (!document.components[category][name]) {
          const resolved = source.components[category]?.[name];
          if (!resolved)
            throw new Error(`Unresolved source reference ${child}`);
          document.components[category][name] = resolved;
          pending.push(resolved);
        }
      } else pending.push(child);
    }
  }
}
const methods = {
  listFunctions: "list",
  createFunction: "create",
  getFunction: "retrieve",
  updateFunction: "update",
  deleteFunction: "delete",
  listFunctionDeployments: "deployments.list",
  createFunctionDeployment: "deployments.create",
  getFunctionDeployment: "deployments.retrieve",
  promoteFunctionDeployment: "deployments.promote",
  listFunctionSecrets: "secrets.list",
  createFunctionSecret: "secrets.create",
  deleteFunctionSecret: "secrets.revoke",
  listFunctionInvocations: "invocations.list",
  getFunctionInvocation: "invocations.retrieve",
  createFunctionInvocation: "invocations.create",
};
const operations = extractOperations("platform", document).map((operation) => {
  const method = methods[operation.operationId];
  if (!method)
    throw new Error(`Unmapped Functions operation ${operation.operationId}`);
  return {
    ...operation,
    typescript: {
      status: "covered",
      method: `Client.project(projectId).functions.${method}`,
    },
  };
});
if (operations.length !== 15)
  throw new Error("Unexpected Functions operation count");
const encode = (value) => format(JSON.stringify(value), { parser: "json" });
const bytes = await encode(document);
writeFileSync(
  new URL("../contracts/functions/openapi.json", import.meta.url),
  bytes,
);
writeFileSync(
  new URL("../contracts/functions/coverage.json", import.meta.url),
  await encode({ schemaVersion: 1, sourceCommit: revision, operations }),
);
writeFileSync(
  new URL("../contracts/functions/source.json", import.meta.url),
  await encode({
    repository: "polymorfa/polymorfa",
    commit: revision,
    sourcePath,
    sourceSha256: createHash("sha256").update(sourceBytes).digest("hex"),
    extraction:
      "Paths beginning /platform/functions and their transitive component references; operation objects unchanged",
    sha256: createHash("sha256").update(bytes).digest("hex"),
    published: false,
  }),
);
