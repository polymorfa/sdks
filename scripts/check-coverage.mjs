#!/usr/bin/env node

import { pathToFileURL } from "node:url";
import { createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";

const HTTP_METHODS = new Set([
  "get",
  "post",
  "put",
  "patch",
  "delete",
  "head",
  "options",
]);
const DOCUMENTATION_KEYS = new Set([
  "description",
  "example",
  "examples",
  "externalDocs",
  "summary",
  "tags",
  "x-mint",
]);
const COVERAGE_STATUSES = new Set([
  "covered",
  "partial",
  "missing",
  "excluded",
]);

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  try {
    const args = parseArguments(process.argv.slice(2));
    const ledger = readJson(args.ledger);
    const actual = [
      ...extractOperations("messaging", readJson(args.messaging)),
      ...extractOperations("platform", readJson(args.platform)),
    ];
    const report = compareCoverage(actual, ledger, args.strict === true);
    if (args.report !== undefined) {
      writeFileSync(args.report, `${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    }
  } catch (error) {
    process.stderr.write(
      `${error instanceof Error ? error.message : String(error)}\n`,
    );
    process.exitCode = 1;
  }
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const flag = argv[index];
    if (!flag?.startsWith("--")) {
      throw new Error(
        "Usage: check-coverage --messaging <spec> --platform <spec> --ledger <ledger> [--report <file>]",
      );
    }
    if (flag === "--strict") {
      values.strict = true;
      continue;
    }
    const value = argv[index + 1];
    if (value === undefined || value.startsWith("--")) {
      throw new Error(`Missing value for ${flag}.`);
    }
    values[flag.slice(2)] = value;
    index += 1;
  }
  for (const required of ["messaging", "platform", "ledger"]) {
    if (typeof values[required] !== "string")
      throw new Error(`Missing required --${required} argument.`);
  }
  return values;
}

function readJson(path) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch (error) {
    throw new Error(
      `Unable to read JSON from ${path}: ${error instanceof Error ? error.message : String(error)}`,
    );
  }
}

function extractOperations(family, document) {
  if (
    document === null ||
    typeof document !== "object" ||
    typeof document.paths !== "object"
  ) {
    throw new Error(
      `${family} specification does not contain an OpenAPI paths object.`,
    );
  }
  const operations = [];
  for (const [path, pathItem] of Object.entries(document.paths)) {
    if (pathItem === null || typeof pathItem !== "object") continue;
    for (const [method, operation] of Object.entries(pathItem)) {
      if (
        !HTTP_METHODS.has(method) ||
        operation === null ||
        typeof operation !== "object"
      )
        continue;
      const normalizedMethod = method.toUpperCase();
      const operationId =
        typeof operation.operationId === "string"
          ? operation.operationId
          : null;
      const shape = {
        method: normalizedMethod,
        path,
        parameters: [
          ...(Array.isArray(pathItem.parameters) ? pathItem.parameters : []),
          ...(Array.isArray(operation.parameters) ? operation.parameters : []),
        ],
        requestBody: operation.requestBody ?? null,
        responses: operation.responses ?? {},
        security: operation.security ?? document.security ?? null,
      };
      operations.push({
        family,
        method: normalizedMethod,
        path,
        operationId,
        fingerprint: fingerprint(shape),
      });
    }
  }
  return operations.sort((left, right) =>
    operationKey(left).localeCompare(operationKey(right)),
  );
}

function compareCoverage(actual, ledger, strict) {
  if (
    ledger === null ||
    typeof ledger !== "object" ||
    ledger.schemaVersion !== 1 ||
    !Array.isArray(ledger.operations)
  ) {
    throw new Error(
      "Coverage ledger must use schemaVersion 1 and contain an operations array.",
    );
  }
  const ledgerByKey = new Map();
  for (const entry of ledger.operations) {
    validateLedgerEntry(entry);
    const key = operationKey(entry);
    if (ledgerByKey.has(key))
      throw new Error(
        `Coverage ledger contains duplicate ${displayKey(entry)}.`,
      );
    ledgerByKey.set(key, entry);
  }

  const missingRows = [];
  const gaps = [];
  const resolutions = [];
  let covered = 0;
  let missing = 0;
  let partial = 0;
  let excluded = 0;
  let changed = 0;
  const actualKeys = new Set();

  for (const operation of actual) {
    const key = operationKey(operation);
    actualKeys.add(key);
    const entry = ledgerByKey.get(key);
    if (entry === undefined) {
      missingRows.push(displayKey(operation));
      missing += 1;
      gaps.push({
        ...operation,
        status: "missing",
        typescript: {
          status: "missing",
          reason: "Operation is absent from the coverage ledger.",
          milestone: "coverage-triage",
        },
      });
      continue;
    }
    if (
      entry.fingerprint !== operation.fingerprint ||
      entry.operationId !== operation.operationId
    ) {
      changed += 1;
      gaps.push({
        ...operation,
        status: "changed",
        previousFingerprint: entry.fingerprint,
        typescript: entry.typescript,
      });
      continue;
    }
    switch (entry.typescript.status) {
      case "covered":
        covered += 1;
        break;
      case "partial":
        partial += 1;
        gaps.push({
          ...operation,
          status: "partial",
          typescript: entry.typescript,
        });
        break;
      case "missing":
        missing += 1;
        gaps.push({
          ...operation,
          status: "missing",
          typescript: entry.typescript,
        });
        break;
      case "excluded":
        excluded += 1;
        break;
    }
  }

  for (const entry of ledger.operations) {
    if (!actualKeys.has(operationKey(entry))) {
      resolutions.push({
        family: entry.family,
        method: entry.method,
        path: entry.path,
        operationId: entry.operationId,
        status: "removed",
      });
    }
  }

  if (strict && missingRows.length > 0) {
    throw new Error(
      `Coverage ledger is missing contract operations:\n${missingRows.map((row) => `- ${row}`).join("\n")}`,
    );
  }

  return {
    schemaVersion: 1,
    sourceCommit: ledger.sourceCommit,
    total: actual.length,
    covered,
    partial,
    missing,
    excluded,
    changed,
    gaps,
    resolutions,
  };
}

function validateLedgerEntry(entry) {
  if (entry === null || typeof entry !== "object")
    throw new Error("Coverage ledger entries must be objects.");
  if (!new Set(["messaging", "platform"]).has(entry.family))
    throw new Error("Coverage family must be messaging or platform.");
  if (
    typeof entry.method !== "string" ||
    !HTTP_METHODS.has(entry.method.toLowerCase())
  ) {
    throw new Error("Coverage method must be a supported HTTP method.");
  }
  if (typeof entry.path !== "string" || !entry.path.startsWith("/"))
    throw new Error("Coverage path must begin with a slash.");
  if (
    typeof entry.fingerprint !== "string" ||
    !/^[a-f0-9]{64}$/.test(entry.fingerprint)
  ) {
    throw new Error(
      `Coverage fingerprint is invalid for ${displayKey(entry)}.`,
    );
  }
  if (
    entry.typescript === null ||
    typeof entry.typescript !== "object" ||
    !COVERAGE_STATUSES.has(entry.typescript.status)
  ) {
    throw new Error(
      `TypeScript coverage status is invalid for ${displayKey(entry)}.`,
    );
  }
  if (
    entry.typescript.status === "covered" &&
    typeof entry.typescript.method !== "string"
  ) {
    throw new Error(
      `Covered operation ${displayKey(entry)} requires a TypeScript method.`,
    );
  }
  if (
    entry.typescript.status !== "covered" &&
    typeof entry.typescript.reason !== "string"
  ) {
    throw new Error(
      `Non-covered operation ${displayKey(entry)} requires a reason.`,
    );
  }
}

function fingerprint(value) {
  const normalized = normalizeContractValue(value);
  return createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
}

function normalizeContractValue(value) {
  if (Array.isArray(value)) return value.map(normalizeContractValue);
  if (value === null || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.keys(value)
      .filter((key) => !DOCUMENTATION_KEYS.has(key))
      .sort()
      .map((key) => [key, normalizeContractValue(value[key])]),
  );
}

function operationKey(operation) {
  return `${operation.family}|${operation.method.toUpperCase()}|${operation.path}`;
}

function displayKey(operation) {
  return `${operation.family} ${operation.method.toUpperCase()} ${operation.path}`;
}

export { extractOperations };
