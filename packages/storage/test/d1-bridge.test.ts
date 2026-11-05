import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { build } from "esbuild";
import { readFileSync } from "node:fs";
import { Miniflare } from "miniflare";
import { createHmac, randomBytes } from "node:crypto";
import { defineStorageConformance } from "../src/conformance.js";
import {
  createD1StorageBridge,
  D1_BRIDGE_CONTRACT,
  D1_BRIDGE_HEADERS as H,
} from "../src/d1-bridge.js";
import { emptyRow } from "../src/merge.js";
import { validateRows } from "../src/adapters/validation.js";
import type {
  CommitResult,
  IndexQuery,
  RowWrite,
  StorageAdapter,
} from "../src/types.js";
import { entityDefinition, type EntityName } from "../src/schema.js";

const secret = "synthetic_D1_bridge_fixture_secret_only_20261015";
const authority = "fixture-customer-a";
const prefix = "bridge_a_";
const sign = (content: string) =>
  "v1=" + createHmac("sha256", secret).update(content).digest("hex");
let mf: Miniflare;
const api = { describe, it, beforeAll, afterAll };

beforeAll(async () => {
  const result = await build({
    stdin: {
      contents: `import { createD1StorageBridge } from './packages/storage/src/d1-bridge.ts';
      export default { fetch(request, env) { return createD1StorageBridge({database:env.DB, authority:env.AUTHORITY, tablePrefix:env.PREFIX, secret:env.SECRET, allowSetup:true}).fetch(request); } };`,
      resolveDir: process.cwd(),
      sourcefile: "d1-bridge-fixture.ts",
    },
    bundle: true,
    write: false,
    format: "esm",
    platform: "browser",
    target: "es2022",
  });
  mf = new Miniflare({
    modules: true,
    script: result.outputFiles[0]!.text,
    compatibilityDate: "2026-07-30",
    d1Databases: { DB: "zk20261015-native-bridge" },
    bindings: { AUTHORITY: authority, PREFIX: prefix, SECRET: secret },
  });
}, 60_000);
afterAll(async () => {
  await mf?.dispose();
});

async function request(
  path: string,
  payload?: unknown,
  alter?: (request: Request) => Request,
) {
  const nonce = randomBytes(32).toString("base64url");
  const method = path === "/handshake" ? "GET" : "POST";
  const body = payload === undefined ? "" : JSON.stringify(payload);
  const req = new Request(`https://storage.customer.example${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secret}`,
      "Content-Type": "application/json",
      [H.nonce]: nonce,
      [H.authority]: authority,
      [H.prefix]: prefix,
      [H.signature]: sign(`${nonce}.${method}.${path}.${body}`),
    },
    ...(method === "POST" ? { body } : {}),
  });
  const mutated = alter ? alter(req) : req;
  const response = await mf.dispatchFetch(mutated.url, {
    method: mutated.method,
    headers: Object.fromEntries(mutated.headers),
    ...(mutated.method === "POST" ? { body: await mutated.text() } : {}),
  });
  const raw = await response.text();
  if (response.headers.get(H.signature)) {
    expect(response.headers.get(H.nonce)).toBe(nonce);
    expect(response.headers.get(H.signature)).toBe(
      sign(`${nonce}.${response.status}.${raw}`),
    );
    const envelope = JSON.parse(raw);
    expect([
      envelope.contract,
      envelope.schemaVersion,
      envelope.authority,
      envelope.tablePrefix,
    ]).toEqual([D1_BRIDGE_CONTRACT, 2, authority, prefix]);
  }
  return { response, envelope: JSON.parse(raw), raw };
}
async function call(path: string, payload?: unknown): Promise<unknown> {
  const { response, envelope } = await request(path, payload);
  if (response.status !== 200 || !response.headers.has(H.signature))
    throw new Error("Storage bridge fixture rejected an operation.");
  return envelope.data;
}

// This runs the same portable merge/lease/checkpoint suite through a real
// Worker fetch boundary and actual D1 binding, not an administrative REST stub.
defineStorageConformance(
  api,
  "d1-worker-bridge",
  async (): Promise<StorageAdapter> => {
    const handshake = await call("/handshake");
    expect(handshake).toMatchObject({
      atomicCommit: true,
      maxCommitSize: 50,
      conditionalDeletes: true,
    });
    return {
      name: "d1-worker-bridge",
      capabilities: { atomicCommit: true, maxCommitSize: 50 },
      async setup() {
        await call("/setup", {});
      },
      async get(entity: EntityName, ids: readonly string[]) {
        const rows = validateRows(entity, await call("/get", { entity, ids }));
        return new Map(rows.map((row) => [row._id, row]));
      },
      async commit(writes: readonly RowWrite[]) {
        return (await call("/commit", { writes })) as CommitResult;
      },
      async query(entity: EntityName, query: IndexQuery) {
        return validateRows(entity, await call("/query", { entity, query }));
      },
    };
  },
);

describe("D1 bridge authority and wire failures", () => {
  it("matches independently calculated portable HMAC vectors", async () => {
    const fixture = JSON.parse(
      readFileSync(
        new URL("../d1-bridge-fixtures.json", import.meta.url),
        "utf8",
      ),
    );
    expect(sign(`${fixture.nonce}.GET./handshake.`)).toBe(
      fixture.request.signature,
    );
    expect(sign(`${fixture.nonce}.200.${fixture.response.rawBody}`)).toBe(
      fixture.response.signature,
    );
    const response = await mf.dispatchFetch(
      "https://storage.customer.example/handshake",
      {
        headers: {
          Authorization: `Bearer ${secret}`,
          [H.nonce]: fixture.nonce,
          [H.signature]: fixture.request.signature,
          [H.authority]: authority,
          [H.prefix]: prefix,
        },
      },
    );
    expect(await response.text()).toBe(fixture.response.rawBody);
    expect(response.headers.get(H.signature)).toBe(fixture.response.signature);
  });
  it("rejects reserved Polymorfa credential prefixes as application secrets before any database use", async () => {
    const database = await mf.getD1Database("DB");
    let calls = 0;
    const counted = new Proxy(database, {
      get(target, property, receiver) {
        const value = Reflect.get(target, property, receiver) as unknown;
        if (typeof value !== "function") return value;
        return (...args: unknown[]) => {
          calls += 1;
          return (value as (...a: unknown[]) => unknown).apply(target, args);
        };
      },
    });
    const filler = "synthetic-fixture-value-0123456789";
    const rejected = [
      ...[
        "pmfa_",
        "pmfa_pt_",
        "pmfa_ct_",
        "pmfa_ls_",
        "pmfa_at_",
        "pmfa_wst_",
        "pmfa_sd_",
      ].map((p) => p + filler),
      "pmfa_" + "x".repeat(251),
      "x".repeat(31),
      "x".repeat(257),
    ];
    for (const candidate of rejected)
      expect(() =>
        createD1StorageBridge({
          database: counted,
          authority,
          tablePrefix: prefix,
          secret: candidate,
          allowSetup: true,
        }),
      ).toThrow(TypeError);
    expect(calls).toBe(0);
    for (const candidate of [
      "x".repeat(32),
      "x".repeat(256),
      "PMFA_uppercase-is-not-reserved-0123456789",
      "xpmfa_not-a-prefix-fixture-0123456789",
    ]) {
      const bridge = createD1StorageBridge({
        database: counted,
        authority,
        tablePrefix: prefix,
        secret: candidate,
      });
      const nonce = randomBytes(32).toString("base64url");
      const response = await bridge.fetch(
        new Request("https://storage.customer.example/handshake", {
          headers: {
            Authorization: `Bearer ${candidate}`,
            [H.nonce]: nonce,
            [H.authority]: authority,
            [H.prefix]: prefix,
            [H.signature]:
              "v1=" +
              createHmac("sha256", candidate)
                .update(`${nonce}.GET./handshake.`)
                .digest("hex"),
          },
        }),
      );
      const raw = await response.text();
      expect(response.status).toBe(200);
      expect(response.headers.get(H.signature)).toBe(
        "v1=" +
          createHmac("sha256", candidate)
            .update(`${nonce}.200.${raw}`)
            .digest("hex"),
      );
    }
  });
  it("keeps schema setup disabled unless the customer operator enables it", async () => {
    const locked = createD1StorageBridge({
      database: await mf.getD1Database("DB"),
      authority,
      tablePrefix: prefix,
      secret,
    });
    const nonce = randomBytes(32).toString("base64url");
    const response = await locked.fetch(
      new Request("https://storage.customer.example/setup", {
        method: "POST",
        body: "{}",
        headers: {
          Authorization: `Bearer ${secret}`,
          "Content-Type": "application/json",
          [H.nonce]: nonce,
          [H.authority]: authority,
          [H.prefix]: prefix,
          [H.signature]: sign(`${nonce}.POST./setup.{}`),
        },
      }),
    );
    const raw = await response.text();
    expect(response.status).toBe(403);
    expect(response.headers.get(H.signature)).toBe(sign(`${nonce}.403.${raw}`));
    expect(JSON.parse(raw).data).toEqual({
      error: "Schema setup is disabled.",
    });
  });
  it("rejects caller prefix/authority, Origin and modified exact-body signatures before writes", async () => {
    for (const [header, value] of [
      [H.prefix, "bridge_b_"],
      [H.authority, "fixture-customer-b"],
      ["Origin", "null"],
      [H.signature, "v1=" + "00".repeat(32)],
    ]) {
      const result = await request("/setup", {}, (req) => {
        req.headers.set(header!, value!);
        return req;
      });
      expect(result.response.status).toBe(403);
      expect(result.raw).not.toContain(secret);
      expect(result.raw).not.toContain(prefix);
    }
    const result = await request(
      "/setup",
      {},
      (req) =>
        new Request(req.url, {
          method: "POST",
          headers: req.headers,
          body: '{"prefix":"other_"}',
        }),
    );
    expect(result.response.status).toBe(403);
  });
  it("returns nonce-bound signed errors and denies remote unconditional deletes", async () => {
    const result = await request("/commit", {
      writes: [{ kind: "delete", entity: "messages", id: "unknown" }],
    });
    expect(result.response.status).toBe(400);
    expect(result.response.headers.has(H.signature)).toBe(true);
    expect(result.envelope.data).toEqual({
      error: "Storage operation failed.",
    });
  });
  it("rejects invalid shapes, unknown fields and scope omissions", async () => {
    for (const [path, payload] of [
      ["/get", { entity: "not-a-table", ids: [] }],
      ["/get", { entity: "messages", ids: [], tablePrefix: "other_" }],
      [
        "/query",
        {
          entity: "messages",
          query: { index: "by_chat", equals: {}, limit: 1 },
        },
      ],
      [
        "/commit",
        {
          writes: [
            {
              kind: "put",
              entity: "messages",
              row: {
                ...emptyRow(entityDefinition("messages"), {
                  sessionId: "bad",
                  messageId: "shape",
                }),
                secretField: secret,
              },
              expectedRev: null,
            },
          ],
        },
      ],
    ] as const) {
      const result = await request(path, payload);
      expect(result.response.status).toBe(400);
      expect(result.raw).not.toContain(secret);
    }
  });
  it("fails closed on deep JSON and unpaged index reads", async () => {
    let nested: unknown = null;
    for (let depth = 0; depth < 65; depth++) nested = [nested];
    for (const [path, body] of [
      ["/get", { entity: "messages", ids: [], nested }],
      [
        "/query",
        {
          entity: "messages",
          query: {
            index: "by_chat",
            equals: { sessionId: "scope", chatId: "chat" },
            limit: 1001,
          },
        },
      ],
    ] as const) {
      expect((await request(path, body)).response.status).toBe(400);
    }
  });
  it("fences clear-child deletes and rejects their replay after row recreation", async () => {
    await call("/setup", {});
    const row = {
      ...emptyRow(entityDefinition("receipts"), {
        sessionId: "fenced-delete",
        messageId: "message",
        recipientId: "recipient",
      }),
      _rev: 1,
    };
    const lease = {
      ...emptyRow(entityDefinition("leases"), { sessionId: "fenced-delete" }),
      _rev: 1,
      owner: "fixture",
      expiresAt: 2000000000000,
    };
    await call("/commit", {
      writes: [
        { kind: "put", entity: "receipts", row, expectedRev: null },
        { kind: "put", entity: "leases", row: lease, expectedRev: null },
      ],
    });
    const writes = [
      { kind: "delete", entity: "receipts", id: row._id },
      {
        kind: "put",
        entity: "leases",
        row: { ...lease, _rev: 2 },
        expectedRev: 1,
      },
    ];
    expect(await call("/commit", { writes })).toEqual({ ok: true });
    await call("/commit", {
      writes: [{ kind: "put", entity: "receipts", row, expectedRev: null }],
    });
    expect(await call("/commit", { writes })).toMatchObject({ ok: false });
    expect(
      await call("/get", { entity: "receipts", ids: [row._id] }),
    ).toMatchObject([{ _rev: 1 }]);
    expect(
      (
        await request("/commit", {
          writes: [
            { kind: "delete", entity: "receipts", id: row._id },
            {
              kind: "put",
              entity: "leases",
              row: { ...lease, sessionId: "foreign", _id: "kforeign", _rev: 2 },
              expectedRev: 1,
            },
          ],
        })
      ).response.status,
    ).toBe(400);
  });
  it("rolls back mixed valid writes and failed CAS in one D1 batch", async () => {
    await call("/setup", {});
    const old = {
      ...emptyRow(entityDefinition("messages"), {
        sessionId: "wire-cas",
        messageId: "old",
      }),
      _rev: 1,
    };
    expect(
      await call("/commit", {
        writes: [
          { kind: "put", entity: "messages", row: old, expectedRev: null },
        ],
      }),
    ).toEqual({ ok: true });
    const fresh = {
      ...emptyRow(entityDefinition("messages"), {
        sessionId: "wire-cas",
        messageId: "new",
      }),
      _rev: 1,
    };
    const result = await call("/commit", {
      writes: [
        { kind: "put", entity: "messages", row: fresh, expectedRev: null },
        {
          kind: "put",
          entity: "messages",
          row: { ...old, _rev: 2 },
          expectedRev: 99,
        },
      ],
    });
    expect(result).toMatchObject({ ok: false });
    expect(
      await call("/get", { entity: "messages", ids: [fresh._id] }),
    ).toEqual([]);
    const rows = await call("/get", { entity: "messages", ids: [old._id] });
    expect(rows).toMatchObject([{ _rev: 1 }]);
  });
});
