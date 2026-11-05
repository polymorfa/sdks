import { expect, it } from "vitest";
import { indexedDB } from "fake-indexeddb";
import { makeFunctionReference } from "convex/server";
import { createStorage } from "../src/engine.js";
import { memoryAdapter } from "../src/adapters/memory.js";
import { indexeddbAdapter } from "../src/adapters/indexeddb.js";
import { convexAdapter } from "../src/adapters/convex.js";
import { emptyRow } from "../src/merge.js";
import { STORAGE_SCHEMA } from "../src/schema.js";
it("rejects unsupported atomic guarantees and unscoped index reads", async () => {
  const adapter = memoryAdapter();
  expect(() =>
    createStorage({
      ...adapter,
      capabilities: { atomicCommit: false, maxCommitSize: 500 },
    }),
  ).toThrow("atomic conditional");
  await expect(
    adapter.query("messages", {
      index: "by_chat",
      equals: { sessionId: "one" },
      limit: 10,
    }),
  ).rejects.toThrow("scope values");
});
it("never binds an IndexedDB database to a different owner", async () => {
  const databaseName = `zk-owner-${Date.now()}`;
  const first = indexeddbAdapter({
    namespace: "ownerA",
    databaseName,
    indexedDB,
  });
  await first.setup?.();
  await first.close?.();
  const foreign = indexeddbAdapter({
    namespace: "ownerB",
    databaseName,
    indexedDB,
  });
  await expect(foreign.get("contacts", [])).rejects.toThrow(
    "different storage namespace",
  );
});
it("rejects duplicate conditional writes without partially inserting a row", async () => {
  const adapter = memoryAdapter();
  const row = {
    ...emptyRow(STORAGE_SCHEMA.contacts, {
      sessionId: "one",
      contactId: "one",
    }),
    _rev: 1,
  };
  const write = {
    kind: "put",
    entity: "contacts",
    row,
    expectedRev: null,
  } as const;
  await expect(adapter.commit([write, write])).rejects.toThrow(
    "same row twice",
  );
  expect((await adapter.get("contacts", [row._id])).size).toBe(0);
});
it("refuses malformed remote Convex receipts and row envelopes", async () => {
  const adapter = convexAdapter(
    {
      query: async () => ({ fake: "rows" }),
      mutation: async () => ({ ok: "true" }),
    },
    {
      get: makeFunctionReference("storage:get"),
      query: makeFunctionReference("storage:query"),
      commit: makeFunctionReference("storage:commit"),
    },
  );
  await expect(adapter.get("contacts", [])).rejects.toThrow(
    "invalid row collection",
  );
  await expect(adapter.commit([])).rejects.toThrow(
    "invalid conditional commit receipt",
  );
});

it("requires a namespace at the JavaScript boundary", () => {
  expect(() =>
    indexeddbAdapter({ namespace: undefined as unknown as string, indexedDB }),
  ).toThrow("namespace is required");
});

it("refuses an incomplete Cosmos batch receipt instead of reporting a durable commit", async () => {
  const { cosmosAdapter } = await import("../src/adapters/cosmos.js");
  const container = {
    item: () => ({
      read: async () => {
        throw Object.assign(new Error("fixture absent"), { code: 404 });
      },
    }),
    items: { batch: async () => ({ result: [] }) },
  } as unknown as import("@azure/cosmos").Container;
  const adapter = cosmosAdapter(container, { namespace: "fixture" });
  const row = {
    ...emptyRow(STORAGE_SCHEMA.contacts, {
      sessionId: "one",
      contactId: "one",
    }),
    _rev: 1,
  };
  await expect(
    adapter.commit([
      { kind: "put", entity: "contacts", row, expectedRev: null },
    ]),
  ).rejects.toThrow("rejected an atomic batch");
});
