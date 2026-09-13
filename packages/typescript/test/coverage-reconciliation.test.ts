import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { HttpCallsApi } from "../../calls/src/index.js";
import { Client } from "../src/index.js";

type LedgerEntry = {
  family: string;
  method: string;
  path: string;
  operationId: string;
  typescript: { status: string; method?: string; reason?: string };
};

const repositoryFile = (path: string) =>
  new URL(`../../../${path}`, import.meta.url);
const ledger = JSON.parse(
  readFileSync(repositoryFile("contracts/coverage.json"), "utf8"),
) as { sourceCommit: string; operations: LedgerEntry[] };
const entry = (operationId: string) => {
  const matches = ledger.operations.filter(
    (operation) => operation.operationId === operationId,
  );
  expect(matches, operationId).toHaveLength(1);
  return matches[0]!;
};

const callId = "call/555";
const participant = {
  id: "participant-555",
  handle: "+15550100",
  audioMuted: false,
  video: false,
  state: "invited",
};
const calls = [
  {
    operationId: "voipPlaceCall",
    method: "place",
    args: [
      {
        session: "support",
        to: "+15550100",
        video: false,
        idempotencyKey: "place-555",
      },
    ],
    body: { session: "support", to: "+15550100", video: false },
    status: 201,
    response: {
      success: true,
      data: { callId, session: "support", video: false },
    },
    result: { callId },
  },
  {
    operationId: "voipAcceptCall",
    method: "accept",
    args: [callId, { video: true }],
    body: { video: true },
    status: 202,
    response: { success: true },
    result: undefined,
  },
  {
    operationId: "voipRejectCall",
    method: "reject",
    args: [callId],
    body: undefined,
    status: 202,
    response: { success: true },
    result: undefined,
  },
  {
    operationId: "voipAddParticipant",
    method: "addParticipant",
    args: [callId, "+15550100"],
    body: { to: "+15550100" },
    status: 201,
    response: { success: true, data: participant },
    result: participant,
  },
  {
    operationId: "voipSetMode",
    method: "setMode",
    args: ["support", "sdk"],
    body: { session: "support", mode: "sdk" },
    status: 200,
    response: { success: true, data: { session: "support", mode: "sdk" } },
    result: undefined,
  },
] as const;

describe("reconciled coverage evidence", () => {
  it("pins byte-identical source snapshots and the ledger to one revision", () => {
    const source = JSON.parse(
      readFileSync(repositoryFile("contracts/source.json"), "utf8"),
    ) as {
      repository: string;
      commit: string;
      contracts: Record<string, { snapshotPath: string; sha256: string }>;
    };
    expect(source.repository).toBe("polymorfa/polymorfa");
    // Repinning the reviewed source requires updating this regression gate too.
    expect(source.commit).toBe("b61d3198aa242d8cba5705e468d2845dc826bf5b");
    expect(ledger.sourceCommit).toBe(source.commit);
    expect(Object.keys(source.contracts).sort()).toEqual([
      "messaging",
      "platform",
    ]);
    for (const contract of Object.values(source.contracts)) {
      const hash = createHash("sha256")
        .update(readFileSync(repositoryFile(contract.snapshotPath)))
        .digest("hex");
      expect(hash, contract.snapshotPath).toBe(contract.sha256);
    }
  });

  it.each(calls)(
    "proves $operationId uses its covered HTTP route and body",
    async (fixture) => {
      const mapping = entry(fixture.operationId);
      expect(mapping.typescript).toEqual({
        status: "covered",
        method: `HttpCallsApi.${fixture.method}`,
      });
      const fetch = vi.fn(async () =>
        Response.json(fixture.response, { status: fixture.status }),
      );
      const api = new HttpCallsApi({
        apiKey: ORGANIZATION_API_KEY,
        baseUrl: "https://api.example.com",
        fetch,
      });
      const result = await Reflect.apply(api[fixture.method], api, [
        ...fixture.args,
      ]);
      expect(result).toEqual(fixture.result);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = fetch.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(url).toBe(
        `https://api.example.com${mapping.path.replace("{id}", encodeURIComponent(callId))}`,
      );
      expect(init.method).toBe(mapping.method);
      if (fixture.body === undefined) {
        expect(init.body).toBeUndefined();
        expect(new Headers(init.headers).has("content-type")).toBe(false);
      } else {
        expect(JSON.parse(init.body as string)).toEqual(fixture.body);
      }
      expect(new Headers(init.headers).get("authorization")).toBe(
        `Bearer ${ORGANIZATION_API_KEY}`,
      );
      if (fixture.method === "place") {
        expect(new Headers(init.headers).get("idempotency-key")).toBe(
          "place-555",
        );
      }
    },
  );

  it("covers QuickLink settings through the exact management routes", async () => {
    const fetch = vi.fn(async () => Response.json({ data: {} }));
    const client = new Client({
      credential: {
        type: "organizationApiKey",
        value: ORGANIZATION_API_KEY,
      },
      fetch,
    });
    await client.quickLinkSettings.retrieve();
    await client.quickLinkSettings.update({});
    expect(fetch.mock.calls).toHaveLength(2);
    for (const call of fetch.mock.calls) {
      const [url] = call as unknown as [string];
      expect(new URL(url).pathname).toBe("/platform/quicklink");
    }
    expect(entry("getQuickLinkSettings").typescript).toEqual({
      status: "covered",
      method: "Client.quickLinkSettings.retrieve",
    });
    expect(entry("updateQuickLinkSettings").typescript).toEqual({
      status: "covered",
      method: "Client.quickLinkSettings.update",
    });
  });

  it("records existing durable Platform methods and explicit contract gaps", () => {
    const operations = ledger.operations.filter(
      ({ family, path, operationId }) =>
        family === "platform" &&
        /^\/platform\/(?:projects\/\{projectId\}\/)?(?:events|operations|webhooks|webhook-deliveries)(?:\/|$)/.test(
          path,
        ) &&
        operationId.length > 0,
    );
    expect(operations).toHaveLength(30);
    for (const operation of operations) {
      expect(["covered", "partial"]).toContain(operation.typescript.status);
      expect(operation.typescript.method).toMatch(/^Client\./);
    }
    expect(
      ledger.operations.some(
        ({ typescript }) =>
          typescript.reason === "Operation is absent from the coverage ledger.",
      ),
    ).toBe(false);
  });

  it("excludes the added Console routes based on their credential contract", () => {
    const platform = JSON.parse(
      readFileSync(repositoryFile("contracts/openapi.platform.json"), "utf8"),
    ) as {
      paths: Record<string, Record<string, { security: unknown }>>;
    };
    const operations = ledger.operations.filter(
      ({ path }) =>
        path === "/console/calls" ||
        path === "/console/projects/{projectId}" ||
        path.startsWith("/console/quicklink/"),
    );
    expect(operations).toHaveLength(7);
    for (const operation of operations) {
      expect(operation.typescript.status, operation.operationId).toBe(
        "excluded",
      );
      expect(
        platform.paths[operation.path]![operation.method.toLowerCase()]!
          .security,
      ).toEqual([{ ConsoleSession: [] }]);
    }
  });
});
