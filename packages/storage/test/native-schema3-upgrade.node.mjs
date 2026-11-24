import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { indexedDB } from "fake-indexeddb";
import { newIndexedDb } from "../../rust/indexeddb/src/indexeddb.js";
import {
  upgradeSchema2,
  abortSchemaUpgrade,
} from "../../dotnet/src/Polymorfa.Storage.IndexedDb/wwwroot/indexeddb.js";
globalThis.indexedDB = indexedDB;
const schema = JSON.parse(
  readFileSync(new URL("../../go/storage/schema2.json", import.meta.url)),
);
const entities = Object.keys(schema).map((x) =>
  x === "sessions" ? "connections" : x,
);
let sequence = 0;
function open(name, version) {
  return new Promise((resolve, reject) => {
    const r = indexedDB.open(name, version);
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
}
async function seed(name, conflict = false, owner = "fixture") {
  const rows = Object.fromEntries(
    Object.entries(schema).map(([entity, definition]) => {
      const keys = Object.fromEntries(
        definition.key.map((k) => [
          k,
          k === "sessionId" ? "stable-session-id" : k + ".value",
        ]),
      );
      const id =
        "k" +
        definition.key
          .map((k) => encodeURIComponent(keys[k]).replace(/\./g, "%2E"))
          .join(":");
      return [
        entity,
        {
          ...keys,
          _id: id,
          _rev: 7,
          _v: { status: 31 },
          extra: { sessionId: "opaque", signature: "exact signed bytes" },
          ...(conflict && entity === "messages"
            ? { connectionId: "foreign" }
            : {}),
        },
      ];
    }),
  );
  await new Promise((resolve, reject) => {
    const r = indexedDB.open(name, 2);
    r.onupgradeneeded = () => {
      for (const entity of Object.keys(schema)) {
        const store = r.result.createObjectStore(entity, { keyPath: "_id" });
        store.put(rows[entity]);
      }
      r.transaction
        .objectStore("leases")
        .put({ _id: "__storage_namespace__", owner });
    };
    r.onsuccess = () => {
      r.result.close();
      resolve();
    };
    r.onerror = () => reject(r.error);
  });
  return rows;
}
function begin(kind, name) {
  if (kind === "rust") {
    const adapter = newIndexedDb(
      "fixture",
      name,
      JSON.stringify(entities),
      1000,
    );
    const controller = new AbortController();
    return {
      promise: adapter.upgradeSchema2(controller.signal),
      cancel: () => controller.abort(),
    };
  }
  const id = "upgrade-" + sequence++;
  return {
    promise: upgradeSchema2("fixture", name, id),
    cancel: () => abortSchemaUpgrade(id),
  };
}
for (const kind of ["rust", "dotnet"]) {
  test(`${kind}: all 17 retained stores preserve IDs, revisions, opaque values and owner`, async () => {
    const name = `${kind}-success`;
    const rows = await seed(name);
    await begin(kind, name).promise;
    const db = await open(name, 3);
    assert.equal(db.objectStoreNames.contains("sessions"), false);
    assert.equal(db.objectStoreNames.length, 17);
    for (const [old, row] of Object.entries(rows)) {
      const entity = old === "sessions" ? "connections" : old;
      const value = await new Promise((resolve, reject) => {
        const r = db.transaction(entity).objectStore(entity).get(row._id);
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const { sessionId, ...rest } = row;
      assert.deepEqual(value, { ...rest, connectionId: sessionId });
    }
    const receipt = await new Promise((resolve) => {
      const r = db
        .transaction("leases")
        .objectStore("leases")
        .get("__storage_namespace__");
      r.onsuccess = () => resolve(r.result);
    });
    assert.deepEqual(receipt, {
      _id: "__storage_namespace__",
      owner: "fixture",
    });
    db.close();
  });
  for (const mode of ["collision", "foreign", "blocked", "cancelled"])
    test(`${kind}: ${mode} leaves schema 2 unchanged`, async () => {
      const name = `${kind}-${mode}`;
      await seed(
        name,
        mode === "collision",
        mode === "foreign" ? "foreign" : "fixture",
      );
      const held =
        mode === "blocked" || mode === "cancelled" ? await open(name, 2) : null;
      const upgrade = begin(kind, name);
      const rejected = assert.rejects(upgrade.promise);
      if (mode === "cancelled") upgrade.cancel();
      await rejected;
      held?.close();
      const db = await open(name, 2);
      assert.equal(db.objectStoreNames.contains("sessions"), true);
      assert.equal(db.objectStoreNames.contains("connections"), false);
      const value = await new Promise((resolve) => {
        const r = db
          .transaction("sessions")
          .objectStore("sessions")
          .get("kstable-session-id");
        r.onsuccess = () => resolve(r.result);
      });
      assert.equal(value.sessionId, "stable-session-id");
      assert.equal(value.connectionId, undefined);
      db.close();
    });
}
