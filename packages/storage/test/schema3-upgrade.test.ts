import { createClient } from "@libsql/client";
import { indexedDB } from "fake-indexeddb";
import { expect, it } from "vitest";
import { ENTITY_NAMES } from "../src/schema.js";
import { upgradeSchema2Row } from "../src/schema3-upgrade.js";
import {
  indexeddbAdapter,
  upgradeIndexedDbSchema2,
} from "../src/adapters/indexeddb.js";
import { libsqlAdapter } from "../src/adapters/libsql.js";

const oldRow = {
  _id: "kaccount%2E1",
  _rev: 9,
  _v: { status: 173, extra: 174 },
  sessionId: "account.1",
  status: "connected",
  extra: {
    sessionId: "opaque-vendor-field",
    signature: "retained exact bytes",
  },
};

it("changes owned account keys while preserving identity, opaque data and merge metadata", () => {
  const result = upgradeSchema2Row("sessions", oldRow);
  expect(result).toEqual({
    entity: "connections",
    row: {
      _id: oldRow._id,
      _rev: oldRow._rev,
      _v: oldRow._v,
      connectionId: oldRow.sessionId,
      status: oldRow.status,
      extra: oldRow.extra,
    },
  });
  expect(oldRow.sessionId).toBe("account.1");
  expect(() =>
    upgradeSchema2Row("sessions", { ...oldRow, connectionId: "other" }),
  ).toThrow("Conflicting");
  expect(() =>
    upgradeSchema2Row("sessions", { ...oldRow, _id: "wrong" }),
  ).toThrow("identity");
});

async function seed(
  name: string,
  row: Record<string, unknown> = oldRow,
  owner = "fixture",
) {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(name, 2);
    request.onupgradeneeded = () => {
      for (const entity of ENTITY_NAMES)
        request.result.createObjectStore(
          entity === "connections" ? "sessions" : entity,
          { keyPath: "_id" },
        );
      request.transaction!.objectStore("sessions").put(row);
      request
        .transaction!.objectStore("leases")
        .put({ _id: "__storage_namespace__", owner });
    };
    request.onsuccess = () => {
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
}

it("upgrades a populated IndexedDB store atomically and keeps its owner sentinel", async () => {
  const databaseName = "upgrade-success";
  await seed(databaseName);
  const options = { namespace: "fixture", databaseName, indexedDB };
  const current = indexeddbAdapter(options);
  await expect(current.setup!()).rejects.toThrow();
  await upgradeIndexedDbSchema2(options);
  const rows = await current.get("connections", [oldRow._id]);
  expect(rows.get(oldRow._id)).toEqual(
    upgradeSchema2Row("sessions", oldRow).row,
  );
  await current.close?.();
  await expect(
    indexeddbAdapter({ ...options, namespace: "foreign" }).setup!(),
  ).rejects.toThrow("different storage namespace");
});

it.each(["collision", "foreign"])(
  "aborts an IndexedDB %s upgrade without changing schema 2",
  async (mode) => {
    const databaseName = `upgrade-${mode}`;
    await seed(
      databaseName,
      mode === "collision" ? { ...oldRow, connectionId: "other" } : oldRow,
      mode === "foreign" ? "foreign" : "fixture",
    );
    await expect(
      upgradeIndexedDbSchema2({
        namespace: "fixture",
        databaseName,
        indexedDB,
      }),
    ).rejects.toThrow();
    await new Promise<void>((resolve, reject) => {
      const request = indexedDB.open(databaseName, 2);
      request.onsuccess = () => {
        expect(request.result.objectStoreNames.contains("sessions")).toBe(true);
        expect(request.result.objectStoreNames.contains("connections")).toBe(
          false,
        );
        request.result.close();
        resolve();
      };
      request.onerror = () => reject(request.error);
    });
  },
);

it.each([2, 4])(
  "never repins SQL storage schema %s during setup or reads",
  async (version) => {
    const db = createClient({ url: "file::memory:" });
    await db.executeMultiple(
      `CREATE TABLE polymorfa_storage_schema(id text PRIMARY KEY, version integer NOT NULL); INSERT INTO polymorfa_storage_schema VALUES('storage', ${version}); CREATE TABLE polymorfa_sessions(_id text); INSERT INTO polymorfa_sessions VALUES('retained');`,
    );
    try {
      // libSQL exercises the same SQLite SQL-core guard on every supported
      // Node version, including Node 20 without the node:sqlite builtin.
      const adapter = libsqlAdapter(db);
      await expect(adapter.setup!()).rejects.toThrow("version mismatch");
      await expect(adapter.get("connections", [])).rejects.toThrow(
        "version mismatch",
      );
      expect(
        (await db.execute("SELECT version FROM polymorfa_storage_schema"))
          .rows[0],
      ).toMatchObject({ version });
      expect(
        (await db.execute("SELECT _id FROM polymorfa_sessions")).rows[0],
      ).toMatchObject({ _id: "retained" });
    } finally {
      db.close();
    }
  },
);

it("leaves a blocked IndexedDB upgrade unchanged after the blocking handle closes", async () => {
  const databaseName = "upgrade-blocked";
  await seed(databaseName);
  const held = await new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
  await expect(
    upgradeIndexedDbSchema2({ namespace: "fixture", databaseName, indexedDB }),
  ).rejects.toThrow("blocked");
  held.close();
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.open(databaseName, 2);
    request.onsuccess = () => {
      expect(request.result.version).toBe(2);
      expect(request.result.objectStoreNames.contains("sessions")).toBe(true);
      expect(request.result.objectStoreNames.contains("connections")).toBe(
        false,
      );
      request.result.close();
      resolve();
    };
    request.onerror = () => reject(request.error);
  });
});
