import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { PlatformClient } from "../src/index.js";

const root = resolve(import.meta.dirname, "../../..");
const source = JSON.parse(
  readFileSync(resolve(root, "contracts/drafts/bansafe/source.json"), "utf8"),
) as {
  sourceState: string;
  contracts: Record<string, { snapshotPath: string; sha256: string }>;
};
const coverage = JSON.parse(
  readFileSync(resolve(root, "contracts/drafts/bansafe/coverage.json"), "utf8"),
) as {
  platformSha256: string;
  covered: number;
  excluded: number;
  missing: number;
  operations: Array<{
    operationId: string;
    method: string;
    path: string;
    status: "covered" | "excluded";
    sdkPath?: string;
  }>;
};
const platform = JSON.parse(
  readFileSync(resolve(root, source.contracts.platform!.snapshotPath), "utf8"),
) as {
  paths: Record<
    string,
    Record<
      string,
      { operationId?: string; tags?: string[]; description?: string }
    >
  >;
};

describe("BanSafe draft contract coverage", () => {
  it("pins the generated draft by content hash without claiming a merged source", () => {
    expect(source.sourceState).toBe("uncommitted-bansafe-draft");
    for (const contract of Object.values(source.contracts)) {
      const hash = createHash("sha256")
        .update(readFileSync(resolve(root, contract.snapshotPath)))
        .digest("hex");
      expect(hash).toBe(contract.sha256);
    }
    expect(coverage.platformSha256).toBe(source.contracts.platform!.sha256);
  });

  it("accounts for every generated BanSafe operation", () => {
    const generated = Object.entries(platform.paths).flatMap(([path, item]) =>
      Object.entries(item)
        .filter(
          ([method, operation]) =>
            ["get", "post", "put", "patch", "delete"].includes(method) &&
            operation.tags?.includes("bansafe"),
        )
        .map(([method, operation]) => ({
          operationId: operation.operationId,
          method: method.toUpperCase(),
          path,
        })),
    );
    expect(
      coverage.operations.map(({ operationId, method, path }) => ({
        operationId,
        method,
        path,
      })),
    ).toEqual(generated);
    expect(coverage).toMatchObject({ covered: 25, excluded: 2, missing: 0 });
  });

  it("maps covered operations to methods and excludes dashboard-only actions", () => {
    const client = new PlatformClient({
      apiKey: "pmfa_contract",
      baseUrl: "https://example.invalid",
    });
    for (const operation of coverage.operations) {
      if (operation.status === "excluded") continue;
      const path = operation
        .sdkPath!.replace(/^PlatformClient\./, "")
        .split(".");
      let value: unknown = client;
      for (const part of path) value = (value as Record<string, unknown>)[part];
      expect(typeof value, operation.sdkPath).toBe("function");
    }

    expect(
      coverage.operations
        .filter(({ status }) => status === "excluded")
        .map(({ operationId }) => operationId),
    ).toEqual(["acknowledgeBanSafeFinding", "appealBanSafeEnforcement"]);
    expect(client.banSafe).not.toHaveProperty("acknowledgeFinding");
    expect(client.banSafe).not.toHaveProperty("appealEnforcement");
  });
});
