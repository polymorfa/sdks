import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { Client, MessagingClient } from "../src/index.js";
import { ORGANIZATION_API_KEY } from "./support/credentials.js";

const root = resolve(import.meta.dirname, "../../..");

interface LedgerRow {
  family: "messaging" | "platform";
  method: string;
  path: string;
  operationId: string;
  typescript: { status: string; method?: string; reason?: string };
}

const ledger = JSON.parse(
  readFileSync(resolve(root, "contracts/coverage.json"), "utf8"),
) as { sourceCommit: string; operations: LedgerRow[] };

const BANSAFE_PATH =
  /\/bansafe\/|\/safe-mode$|\/warmup-plan$|\/insurance-evidence$|\/health-policy$/;

function openApiOperations(
  family: "messaging" | "platform",
): Array<{ method: string; path: string; operationId: string }> {
  const document = JSON.parse(
    readFileSync(resolve(root, `contracts/openapi.${family}.json`), "utf8"),
  ) as {
    paths: Record<string, Record<string, { operationId?: string }>>;
  };
  return Object.entries(document.paths).flatMap(([path, item]) =>
    Object.entries(item)
      .filter(([method]) =>
        ["get", "post", "put", "patch", "delete"].includes(method),
      )
      .map(([method, operation]) => ({
        method: method.toUpperCase(),
        path,
        operationId: operation.operationId ?? "",
      })),
  );
}

const bansafeRows = ledger.operations.filter(({ path }) =>
  BANSAFE_PATH.test(path),
);

describe("BanSafe canonical contract coverage", () => {
  it("covers every BanSafe operation in the pinned snapshots", () => {
    const generated = [
      ...openApiOperations("messaging").map((operation) => ({
        family: "messaging",
        ...operation,
      })),
      ...openApiOperations("platform").map((operation) => ({
        family: "platform",
        ...operation,
      })),
    ].filter(({ path }) => BANSAFE_PATH.test(path));
    const key = (row: { family: string; method: string; path: string }) =>
      `${row.family} ${row.method} ${row.path}`;

    expect(bansafeRows.map(key).sort()).toEqual(generated.map(key).sort());
    expect(bansafeRows).toHaveLength(37);
    expect(
      bansafeRows.filter(({ typescript }) => typescript.status === "covered"),
    ).toHaveLength(35);
    expect(
      bansafeRows.filter(({ typescript }) => typescript.status === "missing"),
    ).toEqual([]);
  });

  it("excludes only the dashboard-only finding and appeal actions", () => {
    expect(
      bansafeRows
        .filter(({ typescript }) => typescript.status === "excluded")
        .map(({ method, path, operationId }) => ({
          method,
          path,
          operationId,
        }))
        .sort((left, right) => left.path.localeCompare(right.path)),
    ).toEqual([
      {
        method: "POST",
        path: "/console/bansafe/enforcement/{session}/appeal",
        operationId: "appealBanSafeEnforcement",
      },
      {
        method: "POST",
        path: "/console/bansafe/findings/{findingId}/acknowledge",
        operationId: "acknowledgeBanSafeFinding",
      },
    ]);
    const client = new Client({
      credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
      baseUrl: "https://example.invalid",
    });
    expect(client.banSafe).not.toHaveProperty("acknowledgeFinding");
    expect(client.banSafe).not.toHaveProperty("appealEnforcement");
  });

  it("maps covered BanSafe operations to server client methods", () => {
    const roots: Record<string, unknown> = {
      Client: new Client({
        credential: { type: "organizationApiKey", value: ORGANIZATION_API_KEY },
        baseUrl: "https://example.invalid",
      }),
      MessagingClient: new MessagingClient({
        credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
        baseUrl: "https://example.invalid",
      }),
    };
    for (const row of bansafeRows) {
      if (row.typescript.status !== "covered") continue;
      const [rootName, ...parts] = row.typescript.method!.split(".");
      expect(rootName === "Client" ? "platform" : "messaging").toBe(row.family);
      let value: unknown = roots[rootName!];
      for (const part of parts)
        value = (value as Record<string, unknown>)[part];
      expect(typeof value, row.typescript.method).toBe("function");
    }
  });
});
