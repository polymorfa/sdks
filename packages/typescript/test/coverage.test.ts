import { mkdtempSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";
import { BrowserMessagingClient } from "../../browser/src/index.js";
import { MessagingClient, PlatformClient } from "../src/index.js";

const checker = fileURLToPath(
  new URL("../../../scripts/check-coverage.mjs", import.meta.url),
);
const messagingContract = fileURLToPath(
  new URL("../../../contracts/openapi.messaging.json", import.meta.url),
);
const platformContract = fileURLToPath(
  new URL("../../../contracts/openapi.platform.json", import.meta.url),
);
const repositoryLedger = fileURLToPath(
  new URL("../../../contracts/coverage.json", import.meta.url),
);
const knownFingerprint =
  "43b00b873e450f67c069001200873efdb343ec4a35a3204ff4b70682d9363f73";

function operation(responseType = "object") {
  return {
    operationId: "listItems",
    summary: "Human documentation does not affect structural coverage",
    responses: {
      "200": {
        description: "OK",
        content: { "application/json": { schema: { type: responseType } } },
      },
    },
  };
}

function runChecker(
  options: {
    readonly extraOperation?: boolean;
    readonly responseType?: string;
    readonly strict?: boolean;
  } = {},
) {
  const directory = mkdtempSync(join(tmpdir(), "polymorfa-coverage-"));
  const messaging = join(directory, "messaging.json");
  const platform = join(directory, "platform.json");
  const ledger = join(directory, "ledger.json");
  const report = join(directory, "report.json");
  writeFileSync(
    messaging,
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Messaging", version: "1" },
      paths: {
        "/v1/items": { get: operation(options.responseType) },
        ...(options.extraOperation
          ? { "/v1/items/{id}": { delete: operation() } }
          : {}),
      },
    }),
  );
  writeFileSync(
    platform,
    JSON.stringify({
      openapi: "3.0.3",
      info: { title: "Platform", version: "1" },
      paths: {},
    }),
  );
  writeFileSync(
    ledger,
    JSON.stringify({
      schemaVersion: 1,
      sourceCommit: "fixture",
      operations: [
        {
          family: "messaging",
          method: "GET",
          path: "/v1/items",
          operationId: "listItems",
          fingerprint: knownFingerprint,
          typescript: { status: "covered", method: "RawClient.request" },
        },
      ],
    }),
  );

  const checkerArguments = [
    checker,
    "--messaging",
    messaging,
    "--platform",
    platform,
    "--ledger",
    ledger,
    "--report",
    report,
    ...(options.strict ? ["--strict"] : []),
  ];
  const result = spawnSync(process.execPath, checkerArguments, {
    encoding: "utf8",
  });
  return {
    ...result,
    report:
      result.status === 0
        ? (JSON.parse(readFileSync(report, "utf8")) as Record<string, unknown>)
        : undefined,
  };
}

function runRepositoryChecker() {
  const directory = mkdtempSync(join(tmpdir(), "polymorfa-coverage-repo-"));
  const report = join(directory, "report.json");
  const result = spawnSync(
    process.execPath,
    [
      checker,
      "--messaging",
      messagingContract,
      "--platform",
      platformContract,
      "--ledger",
      repositoryLedger,
      "--report",
      report,
      "--strict",
    ],
    { encoding: "utf8" },
  );
  return {
    ...result,
    report:
      result.status === 0
        ? (JSON.parse(readFileSync(report, "utf8")) as Record<string, unknown>)
        : undefined,
  };
}

describe("coverage checker", () => {
  it("reports the reviewed repository ledger totals", () => {
    const result = runRepositoryChecker();
    expect(result.status, result.stderr).toBe(0);
    expect(result.report).toMatchObject({
      sourceCommit: "f156af2dda13e62b6b106a542fdedb39524bdb66",
      total: 331,
      covered: 139,
      partial: 0,
      missing: 129,
      excluded: 63,
      changed: 0,
    });
  });

  it("resolves every covered ledger mapping to a public client method", () => {
    const ledger = JSON.parse(readFileSync(repositoryLedger, "utf8")) as {
      operations: Array<{
        typescript: { status: string; method?: string };
      }>;
    };
    const roots: Readonly<Record<string, unknown>> = {
      MessagingClient: new MessagingClient({
        credential: { type: "apiKey", value: "pmfa_messaging" },
      }),
      PlatformClient: new PlatformClient({ apiKey: "pmfa_platform" }),
      BrowserMessagingClient: new BrowserMessagingClient({
        session: "coverage",
        getClientToken: async () => "pmfa_ct_coverage",
      }),
    };

    for (const operation of ledger.operations) {
      if (operation.typescript.status !== "covered") continue;
      const parts = operation.typescript.method?.split(".") ?? [];
      let value: unknown = roots[parts[0] ?? ""];
      for (const part of parts.slice(1)) {
        expect(value, operation.typescript.method).toBeTypeOf("object");
        value = (value as Readonly<Record<string, unknown>>)[part];
      }
      expect(value, operation.typescript.method).toBeTypeOf("function");
    }
  });

  it("accepts a complete ledger and emits machine-readable counts", () => {
    const result = runChecker();
    expect(result.status, result.stderr).toBe(0);
    expect(result.report).toMatchObject({
      total: 1,
      covered: 1,
      missing: 0,
      changed: 0,
      gaps: [],
    });
  });

  it("fails when a contract operation has no ledger row", () => {
    const result = runChecker({ extraOperation: true, strict: true });
    expect(result.status).toBe(1);
    expect(result.stderr).toContain("DELETE /v1/items/{id}");
  });

  it("reports an absent ledger row as a non-blocking gap when strict mode is off", () => {
    const result = runChecker({ extraOperation: true });
    expect(result.status, result.stderr).toBe(0);
    expect(result.report).toMatchObject({
      total: 2,
      covered: 1,
      missing: 1,
      changed: 0,
    });
    expect(result.report?.gaps).toEqual([
      expect.objectContaining({
        method: "DELETE",
        path: "/v1/items/{id}",
        status: "missing",
      }),
    ]);
  });

  it("reports a structural fingerprint change as a non-blocking gap", () => {
    const result = runChecker({ responseType: "array" });
    expect(result.status, result.stderr).toBe(0);
    expect(result.report).toMatchObject({
      total: 1,
      covered: 0,
      missing: 0,
      changed: 1,
    });
    expect(result.report?.gaps).toEqual([
      expect.objectContaining({
        family: "messaging",
        method: "GET",
        path: "/v1/items",
        status: "changed",
      }),
    ]);
  });
});
