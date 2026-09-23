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
if (
  createHash("sha256").update(bytes).digest("hex") !== source.sha256 ||
  ledger.sourceCommit !== source.commit ||
  !/^[0-9a-f]{40}$/.test(source.commit)
)
  throw new Error("Functions contract source or digest does not match");
const report = compareCoverage(
  extractOperations("platform", JSON.parse(bytes)),
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
process.stdout.write(JSON.stringify(report, null, 2) + "\n");
