import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { compareCoverage, extractOperations } from "./check-coverage.mjs";
const read = (path) =>
  JSON.parse(readFileSync(new URL(path, import.meta.url), "utf8"));
const source = read("../contracts/functions/source.json");
const ledger = read("../contracts/functions/coverage.json");
const bytes = readFileSync(
  new URL("../contracts/functions/openapi.json", import.meta.url),
);
const contract = JSON.parse(bytes);
if (
  createHash("sha256").update(bytes).digest("hex") !== source.sha256 ||
  ledger.sourceCommit !== source.commit ||
  !/^[0-9a-f]{40}$/.test(source.commit)
)
  throw new Error("Functions contract source or digest does not match");
const report = compareCoverage(
  extractOperations("platform", contract),
  ledger,
  true,
);
if (
  report.total !== 15 ||
  report.covered !== 15 ||
  report.gaps.length ||
  report.resolutions.length
)
  throw new Error("Functions coverage is incomplete or stale");
const schemas = contract.components.schemas;
const full = schemas.FunctionDeployment;
const summary = schemas.FunctionDeploymentSummary;
const page = schemas.FunctionDeploymentPage;
const sameFields = (left, right) =>
  JSON.stringify([...left].sort()) === JSON.stringify([...right].sort());
if (
  !full?.properties?.source ||
  !full.required.includes("source") ||
  !summary?.properties ||
  !summary?.required ||
  summary?.properties?.source !== undefined ||
  !sameFields(
    Object.keys(summary.properties),
    Object.keys(full.properties).filter((field) => field !== "source"),
  ) ||
  !sameFields(
    summary.required,
    full.required.filter((field) => field !== "source"),
  ) ||
  page?.properties?.items?.items?.$ref !==
    "#/components/schemas/FunctionDeploymentSummary"
)
  throw new Error("Functions deployment list contract must omit source only");
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
