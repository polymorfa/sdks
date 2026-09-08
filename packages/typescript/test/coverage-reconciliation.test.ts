import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { HttpCallsApi } from "../../calls/src/index.js";
import { PlatformClient } from "../src/index.js";

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
    expect(source.commit).toBe("8c244aab0e5626d101a2c8c4915287427f39e014");
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
        apiKey: "pmfa_coverage",
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
        "Bearer pmfa_coverage",
      );
      if (fixture.method === "place") {
        expect(new Headers(init.headers).get("idempotency-key")).toBe(
          "place-555",
        );
      }
    },
  );

  it("does not transfer obsolete widget settings coverage to QuickLink", async () => {
    const fetch = vi.fn(async () => Response.json({ data: {} }));
    const client = new PlatformClient({ apiKey: "pmfa_coverage", fetch });
    await client.widgetSettings.retrieve();
    await client.widgetSettings.update({});
    expect(fetch.mock.calls).toHaveLength(2);
    for (const call of fetch.mock.calls) {
      const [url] = call as unknown as [string];
      expect(new URL(url).pathname).toBe("/v1/widget");
    }
    for (const operationId of [
      "getQuickLinkSettings",
      "updateQuickLinkSettings",
    ]) {
      expect(entry(operationId).typescript).toMatchObject({
        status: "missing",
        reason: expect.stringContaining("/v1/widget"),
      });
    }
    expect(
      ledger.operations.filter(({ path }) => /\/widget(?:\/|$)/.test(path)),
    ).toEqual([]);
  });

  it("keeps unimplemented durable Platform resources explicitly missing", () => {
    const operations = ledger.operations.filter(
      ({ family, path, operationId }) =>
        family === "platform" &&
        /^\/v1\/(?:projects\/\{projectId\}\/)?(?:events|operations|webhooks|webhook-deliveries)(?:\/|$)/.test(
          path,
        ) &&
        operationId !== "getOrganizationOperation",
    );
    expect(operations).toHaveLength(37);
    for (const operation of operations) {
      expect(operation.typescript.status, operation.operationId).toBe(
        "missing",
      );
      expect(operation.typescript.method).toBeUndefined();
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
