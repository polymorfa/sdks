import { format, resolveConfig } from "prettier";
import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const operations = [
  "setTestingAccountMode",
  "createQuickLink",
  "getBusinessProfile",
];
const sourcePath = "apps/api/docs/openapi.json";
const output = resolve(
  import.meta.dirname,
  "../contracts/business-account-modes.json",
);

export function extractBusinessContract(raw, commit) {
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error("An exact API commit is required");
  const document = JSON.parse(raw);
  const paths = {};
  const found = new Set();
  for (const [path, methods] of Object.entries(document.paths)) {
    for (const [method, operation] of Object.entries(methods)) {
      if (!operations.includes(operation?.operationId)) continue;
      if (found.has(operation.operationId))
        throw new Error("Duplicate operationId");
      found.add(operation.operationId);
      (paths[path] ??= {})[method] = operation;
    }
  }
  if (found.size !== operations.length)
    throw new Error("Business contract operations are missing");
  const components = {};
  const visited = new Set();
  function visit(value) {
    if (!value || typeof value !== "object") return;
    if (typeof value.$ref === "string") {
      const match = /^#\/components\/([^/]+)\/([^/]+)$/.exec(value.$ref);
      if (!match) throw new Error(`Unsupported reference ${value.$ref}`);
      if (!visited.has(value.$ref)) {
        visited.add(value.$ref);
        const target = document.components?.[match[1]]?.[match[2]];
        if (!target) throw new Error(`Missing reference ${value.$ref}`);
        (components[match[1]] ??= {})[match[2]] = target;
        visit(target);
      }
    }
    for (const nested of Object.values(value)) visit(nested);
  }
  visit(paths);
  return {
    repository: "polymorfa/polymorfa",
    commit,
    releaseStatus: "source-only",
    sources: {
      messaging: {
        sourcePath,
        sourceSha256: createHash("sha256").update(raw).digest("hex"),
        paths,
        components,
      },
    },
  };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const args = process.argv.slice(2);
  const apiRoot = args[args.indexOf("--api-root") + 1];
  const commit = args[args.indexOf("--commit") + 1];
  if (
    !args.includes("--api-root") ||
    !args.includes("--commit") ||
    !apiRoot ||
    !commit
  )
    throw new Error(
      "Use --api-root <own API checkout> --commit <full SHA> [--check]",
    );
  if (!/^[a-f0-9]{40}$/.test(commit))
    throw new Error("An exact API commit is required");
  const head = execFileSync("git", ["-C", apiRoot, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).trim();
  if (head !== commit)
    throw new Error("API source HEAD does not match the requested commit");
  const raw = execFileSync(
    "git",
    ["-C", apiRoot, "show", `${commit}:${sourcePath}`],
    { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 },
  );
  const bytes = await format(
    JSON.stringify(extractBusinessContract(raw, commit)),
    { ...(await resolveConfig(output)), filepath: output },
  );
  if (args.includes("--check")) {
    if (readFileSync(output, "utf8") !== bytes)
      throw new Error("Business contract drifted");
  } else writeFileSync(output, bytes);
}
