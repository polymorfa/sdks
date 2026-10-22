import { spawnSync } from "node:child_process";
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

type Coverage = { status: string; method?: string; reason?: string };
type Row = {
  family: "messaging" | "platform";
  method: string;
  path: string;
  operationId: string;
  fingerprint: string;
  typescript: Coverage;
};
type Schema = {
  type?: string;
  nullable?: boolean;
  enum?: unknown[];
  default?: unknown;
  required?: string[];
  properties?: Record<string, Schema>;
  items?: Schema;
};
type Operation = {
  security: unknown;
  requestBody: { content: { "application/json": { schema: Schema } } };
  responses: Record<
    string,
    { content?: { "application/json": { schema: Schema } } }
  >;
};
type Source = {
  sourcePath: string;
  sourceSha256: string;
  paths: Record<string, Record<string, Operation>>;
  components: Record<string, Record<string, unknown>>;
};

const repositoryFile = (path: string) =>
  fileURLToPath(new URL(`../../../${path}`, import.meta.url));
const contract = JSON.parse(
  readFileSync(repositoryFile("contracts/feature-evaluation.json"), "utf8"),
) as {
  commit: string;
  branch: string;
  sources: Record<"messaging" | "platform", Source>;
  operations: Row[];
};
const ledger = JSON.parse(
  readFileSync(repositoryFile("contracts/coverage.json"), "utf8"),
) as { operations: Row[] };
const { messaging, platform } = contract.sources;
const operation = (source: Source, path: string) => source.paths[path]!.post!;

function itemSchema(source: Source, path: string) {
  const data = operation(source, path).responses["200"]!.content![
    "application/json"
  ].schema.properties!.data!;
  return data.items!;
}

describe("feature evaluation contract supplement", () => {
  it("pins the merged API source for both audiences", () => {
    expect(contract.commit).toMatch(/^[0-9a-f]{40}$/);
    expect(contract.branch).toBe("dev");
    expect(messaging.sourcePath).toBe("apps/api/docs/openapi.json");
    expect(platform.sourcePath).toBe("apps/api/docs/openapi.management.json");
    for (const source of [messaging, platform])
      expect(source.sourceSha256).toMatch(/^[0-9a-f]{64}$/);
  });

  it("reproduces the recorded fingerprints from the stored operations", () => {
    const directory = mkdtempSync(join(tmpdir(), "polymorfa-features-"));
    const file = (name: string, value: unknown) => {
      const path = join(directory, name);
      writeFileSync(path, JSON.stringify(value));
      return path;
    };
    const report = join(directory, "report.json");
    const result = spawnSync(
      process.execPath,
      [
        repositoryFile("scripts/check-coverage.mjs"),
        "--messaging",
        file("messaging.json", messaging),
        "--platform",
        file("platform.json", platform),
        "--ledger",
        file("ledger.json", {
          schemaVersion: 1,
          sourceCommit: contract.commit,
          operations: contract.operations,
        }),
        "--report",
        report,
        "--strict",
      ],
      { encoding: "utf8" },
    );
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
    expect(JSON.parse(readFileSync(report, "utf8"))).toMatchObject({
      total: 4,
      excluded: 4,
      changed: 0,
      missing: 0,
      gaps: [],
      resolutions: [],
    });
  });

  it("records the reviewed request and response fields", () => {
    for (const [source, path] of [
      [messaging, "/messaging/features/evaluate"],
      [platform, "/api/account/features/evaluate"],
    ] as const) {
      const request = operation(source, path).requestBody.content[
        "application/json"
      ].schema;
      expect(request.properties!.locale).toMatchObject({
        type: "string",
        enum: ["en", "pt-BR"],
        default: "en",
      });
      // Still accepted for compatibility; the API ignores it.
      expect(request.properties!.measurementAllowed).toMatchObject({
        type: "boolean",
      });

      const item = itemSchema(source, path);
      expect(item.required).toEqual(
        expect.arrayContaining([
          "state",
          "terms",
          "enrollmentSource",
          "exposureToken",
        ]),
      );
      expect(item.properties!.state!.enum).toEqual(["off", "opt_in", "on"]);
      expect(item.properties!.terms).toMatchObject({
        type: "string",
        nullable: true,
      });
      expect(item.properties!.enrollmentSource).toMatchObject({
        nullable: true,
        enum: ["customer", "staff", null],
      });
      // Deprecated and always null.
      expect(item.properties!.exposureToken!.nullable).toBe(true);
    }
  });

  it("keeps every feature availability operation excluded", () => {
    expect(contract.operations.map((row) => row.operationId).sort()).toEqual([
      "evaluateAccountFeatures",
      "evaluateFeatures",
      "recordFeatureExposure",
      "setFeatureEnrollment",
    ]);
    for (const row of contract.operations) {
      const matches = ledger.operations.filter(
        (entry) =>
          entry.family === row.family &&
          entry.method === row.method &&
          entry.path === row.path &&
          entry.operationId === row.operationId,
      );
      expect(matches, row.operationId).toHaveLength(1);
      expect(row.typescript.status, row.operationId).toBe("excluded");
      expect(row.typescript.method, row.operationId).toBeUndefined();
      expect(matches[0]!.typescript, row.operationId).toEqual(row.typescript);
    }
    // Team and project credentials can call evaluation; the account routes
    // need dashboard identity.
    expect(
      operation(messaging, "/messaging/features/evaluate").security,
    ).toEqual([{ BearerAuth: [] }]);
    for (const path of Object.keys(platform.paths))
      expect(operation(platform, path).security, path).toEqual([
        { ConsoleSession: [] },
      ]);
  });

  it("has no typed SDK method for these routes", () => {
    const packages = repositoryFile("packages");
    const files = readdirSync(packages, { recursive: true, encoding: "utf8" })
      .filter((path) => /^[^/]+\/src\/.*\.tsx?$/.test(path))
      .map((path) => join(packages, path));
    expect(files.length).toBeGreaterThan(0);
    for (const file of files)
      expect(readFileSync(file, "utf8"), file).not.toMatch(
        /features\/(?:evaluate|enrollment|exposure)/,
      );
  });
});
