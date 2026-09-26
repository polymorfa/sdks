import { ORGANIZATION_API_KEY } from "./support/credentials.js";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

import { describe, expect, it, vi } from "vitest";
import { Client, MessagingClient } from "../src/index.js";

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
  phoneNumber: "+15550100",
  audioMuted: false,
  video: false,
  state: "invited",
};
const callSettings = {
  conferenceMode: true,
  updatedAt: "2026-09-16T10:00:00.000Z",
};
const callPermission = {
  conversation: { id: "739182640518203", phoneNumber: "+14155550123" },
  status: "temporary",
  expiresAt: "2026-09-26T10:00:00.000Z",
  source: "user_action",
  updatedAt: "2026-09-19T10:00:00.000Z",
  checkedAt: "2026-09-19T12:30:00.000Z",
  fresh: true,
  actions: {
    requestPermission: { allowed: false, limits: [] },
    startCall: { allowed: true, limits: [] },
  },
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
        exclusive: true,
        participant: "desk-1",
      },
      { idempotencyKey: "place-555" },
    ],
    body: {
      session: "support",
      to: "+15550100",
      video: false,
      exclusive: true,
      participant: "desk-1",
    },
    status: 201,
    response: {
      success: true,
      data: { callId, session: "support", video: false },
    },
  },
  {
    operationId: "voipAcceptCall",
    method: "accept",
    args: [callId, { video: true, exclusive: false, participant: "desk-1" }],
    body: { video: true, exclusive: false, participant: "desk-1" },
    status: 200,
    response: {
      success: true,
      data: { answered: true, answeredBy: "server:desk-1", exclusive: false },
    },
  },
  {
    operationId: "voipRejectCall",
    method: "reject",
    args: [callId],
    body: undefined,
    status: 202,
    response: { success: true },
  },
  {
    operationId: "voipLeaveCall",
    method: "leave",
    args: [callId, { connectionId: "conn_0555" }],
    body: { connectionId: "conn_0555" },
    status: 200,
    response: { success: true },
  },
  {
    operationId: "voipTeardown",
    method: "end",
    args: [callId],
    body: undefined,
    status: 200,
    response: { success: true },
  },
  {
    operationId: "voipReportCallDiagnostics",
    method: "report",
    args: [
      callId,
      {
        kind: "quality",
        connectionId: "conn_0123456789",
        participant: "desk-1",
        client: { sdk: "@polymorfa/sdk", version: "1.2.3", platform: "node" },
        quality: { rttMs: 42, candidateType: "relay" },
      },
    ],
    body: {
      kind: "quality",
      connectionId: "conn_0123456789",
      participant: "desk-1",
      client: { sdk: "@polymorfa/sdk", version: "1.2.3", platform: "node" },
      quality: { rttMs: 42, candidateType: "relay" },
    },
    status: 202,
    response: { success: true },
  },
  {
    operationId: "voipAddParticipant",
    method: "addParticipant",
    args: [callId, { to: "+15550100" }],
    body: { to: "+15550100" },
    status: 201,
    response: { success: true, data: participant },
  },
  {
    operationId: "getCallPermission",
    method: "retrieveCallPermission",
    args: ["support/eu", "+14155550123"],
    body: undefined,
    status: 200,
    response: { success: true, data: callPermission },
  },
  {
    operationId: "checkCall",
    method: "check",
    args: [{ session: "support/eu", to: "+14155550123" }],
    body: { session: "support/eu", to: "+14155550123" },
    status: 200,
    response: {
      success: true,
      data: {
        allowed: false,
        refusal: "call_permission_required",
        permission: { status: "revoked", fresh: true },
      },
    },
  },
  {
    operationId: "getCallSettings",
    method: "retrieveCallSettings",
    args: ["support/eu"],
    body: undefined,
    status: 200,
    response: { success: true, data: callSettings },
  },
  {
    operationId: "updateCallSettings",
    method: "updateCallSettings",
    args: ["support/eu", { conferenceMode: true }],
    body: { conferenceMode: true },
    status: 200,
    response: { success: true, data: callSettings },
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
    expect(source.commit).toBe("18e285de80add7c0f32dca1ac812116bf61b8836");
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

  it("maps all four hosted-history reads to the server SDK", () => {
    expect(entry("listChats").typescript).toEqual({
      status: "covered",
      method: "MessagingClient.chats.list",
    });
    expect(entry("getChat").typescript).toEqual({
      status: "covered",
      method: "MessagingClient.chats.retrieve",
    });
    expect(entry("listChatMessages").typescript).toEqual({
      status: "covered",
      method: "MessagingClient.chats.listMessages",
    });
    expect(entry("getChatMessage").typescript).toEqual({
      status: "covered",
      method: "MessagingClient.chats.retrieveMessage",
    });
  });

  it.each(calls)(
    "proves $operationId uses its covered HTTP route and body",
    async (fixture) => {
      const mapping = entry(fixture.operationId);
      expect(mapping.typescript).toEqual({
        status: "covered",
        method: `MessagingClient.voip.${fixture.method}`,
      });
      const fetch = vi.fn(async () =>
        Response.json(fixture.response, { status: fixture.status }),
      );
      const messaging = new MessagingClient({
        credential: { type: "apiKey", value: ORGANIZATION_API_KEY },
        baseUrl: "https://api.example.com",
        maxNetworkRetries: 0,
        fetch,
      });
      const resource = messaging.voip as unknown as Record<
        string,
        (...args: readonly unknown[]) => Promise<{ data: unknown }>
      >;
      const result = await Reflect.apply(resource[fixture.method]!, resource, [
        ...fixture.args,
      ]);
      expect(result.data).toEqual(fixture.response);
      expect(fetch).toHaveBeenCalledTimes(1);
      const [url, init] = fetch.mock.calls[0] as unknown as [
        string,
        RequestInit,
      ];
      expect(new URL(url).pathname).toBe(
        mapping.path
          .replace("{id}", encodeURIComponent(callId))
          .replace("{session}", encodeURIComponent("support/eu"))
          .replace("{to}", encodeURIComponent("+14155550123")),
      );
      expect(init.method).toBe(mapping.method);
      if (fixture.body === undefined) {
        expect(init.body ?? undefined).toBeUndefined();
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

  it("retires session answer modes and calling tickets", () => {
    for (const operationId of [
      "voipSetMode",
      "voipToken",
      "voipSocketTicket",
      "voipAgentToken",
    ]) {
      expect(
        ledger.operations.filter(
          (operation) => operation.operationId === operationId,
        ),
        operationId,
      ).toEqual([]);
    }
  });

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

  it("covers every durable Platform developer resource", () => {
    const operations = ledger.operations.filter(
      ({ family, path, operationId }) =>
        family === "platform" &&
        /^\/platform\/(?:projects\/\{projectId\}\/)?(?:events|webhooks|webhook-deliveries)(?:\/|$)/.test(
          path,
        ) &&
        operationId.length > 0,
    );
    expect(operations).toHaveLength(32);
    for (const operation of operations) {
      expect(operation.typescript.status, operation.operationId).toBe(
        "covered",
      );
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
