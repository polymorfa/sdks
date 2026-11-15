import { upgradeSchema2Row } from "../schema3-upgrade.js";
import {
  ENTITY_NAMES,
  STORAGE_SCHEMA_VERSION,
  entityDefinition,
} from "../schema.js";
import type { StorageAdapter, StoredRow } from "../types.js";
import { filterRows } from "./shared.js";
import { namespace, validateCommit, validateQuery } from "./validation.js";

export interface IndexedDbAdapterOptions {
  readonly namespace: string;
  readonly databaseName?: string;
  readonly indexedDB?: IDBFactory;
  readonly maxQueryRows?: number;
}
const requestResult = <T>(request: IDBRequest<T>): Promise<T> =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(new Error("IndexedDB storage request failed."));
  });
const transactionDone = (tx: IDBTransaction): Promise<void> =>
  new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = tx.onabort = () =>
      reject(new Error("IndexedDB storage transaction failed."));
  });
export function indexeddbAdapter(
  options: IndexedDbAdapterOptions,
): StorageAdapter {
  const owner = namespace(options.namespace);
  let database: IDBDatabase | undefined;
  let opening: Promise<IDBDatabase> | undefined;
  const open = (): Promise<IDBDatabase> => {
    if (database) return Promise.resolve(database);
    if (opening) return opening;
    const factory = options.indexedDB ?? globalThis.indexedDB;
    if (!factory)
      throw new TypeError("IndexedDB is unavailable in this runtime.");
    const request = factory.open(
      options.databaseName ?? `polymorfa_${owner}`,
      STORAGE_SCHEMA_VERSION,
    );
    request.onupgradeneeded = (event) => {
      // Existing stores require the explicit upgrade helper; opening a new client
      // must never silently abandon an older account partition.
      if (event.oldVersion !== 0) {
        request.transaction!.abort();
        return;
      }
      for (const entity of ENTITY_NAMES)
        if (!request.result.objectStoreNames.contains(entity))
          request.result.createObjectStore(entity, { keyPath: "_id" });
    };
    const opened = new Promise<IDBDatabase>((resolve, reject) => {
      let blocked = false;
      request.onblocked = () => {
        blocked = true;
        reject(
          new Error(
            "The IndexedDB schema upgrade is blocked. Close other connections and retry.",
          ),
        );
      };
      request.onsuccess = () => {
        if (blocked) request.result.close();
        else resolve(request.result);
      };
      request.onerror = () =>
        reject(new Error("IndexedDB storage could not open."));
    });
    opening = opened
      .then(async (result) => {
        try {
          await checkOwner(result);
        } catch (error) {
          result.close();
          throw error;
        }
        database = result;
        result.onversionchange = () => {
          result.close();
          database = undefined;
          opening = undefined;
        };
        return result;
      })
      .catch((error: unknown) => {
        opening = undefined;
        throw error;
      });
    return opening;
  };
  // A database belongs to one namespace; a caller-selected database must not bind
  // the same object-store keys to a different owner.
  const checkOwner = async (db: IDBDatabase) => {
    const tx = db.transaction("leases", "readwrite");
    const done = transactionDone(tx);
    const store = tx.objectStore("leases");
    const id = "__storage_namespace__";
    const current = (await requestResult(store.get(id))) as
      { owner?: string } | undefined;
    if (current && current.owner !== owner) {
      tx.abort();
      await done.catch(() => undefined);
      throw new TypeError(
        "The IndexedDB database belongs to a different storage namespace.",
      );
    }
    if (!current) store.add({ _id: id, owner });
    await done;
  };
  return {
    name: "indexeddb",
    capabilities: { atomicCommit: true, maxCommitSize: 1000 },
    async setup() {
      await open();
    },
    async get(entity, ids) {
      const db = await open();
      const tx = db.transaction(entity, "readonly");
      const done = transactionDone(tx);
      const store = tx.objectStore(entity);
      const rows = await Promise.all(
        ids.map((id) => requestResult(store.get(id))),
      );
      await done;
      return new Map(
        rows
          .filter((row): row is StoredRow => row !== undefined)
          .map((row) => [row._id, row]),
      );
    },
    async commit(writes) {
      validateCommit(writes, 1000);
      if (!writes.length) return { ok: true };
      const db = await open();
      const tx = db.transaction(
        [...new Set(writes.map((write) => write.entity))],
        "readwrite",
      );
      const done = transactionDone(tx);
      // Every read request is queued before yielding. Subsequent writes are
      // queued from the final read's microtask while the transaction is active.
      const rows = (await Promise.all(
        writes.map((write) =>
          requestResult(
            tx
              .objectStore(write.entity)
              .get(write.kind === "put" ? write.row._id : write.id),
          ),
        ),
      )) as (StoredRow | undefined)[];
      const conflicts: string[] = [];
      for (let i = 0; i < writes.length; i++) {
        const write = writes[i]!;
        const current = rows[i];
        if (
          write.kind === "put"
            ? write.expectedRev === null
              ? current !== undefined
              : current?._rev !== write.expectedRev
            : write.expectedRev !== undefined &&
              current?._rev !== write.expectedRev
        )
          conflicts.push(write.kind === "put" ? write.row._id : write.id);
      }
      if (conflicts.length) {
        tx.abort();
        await done.catch(() => undefined);
        return { ok: false, conflicts };
      }
      for (const write of writes) {
        const store = tx.objectStore(write.entity);
        if (write.kind === "put") store.put(write.row);
        else store.delete(write.id);
      }
      await done;
      return { ok: true };
    },
    async query(entity, query) {
      validateQuery(entity, query);
      const db = await open();
      const tx = db.transaction(entity, "readonly");
      const done = transactionDone(tx);
      const rows = (await requestResult(
        tx.objectStore(entity).getAll(),
      )) as StoredRow[];
      await done;
      if (rows.length > (options.maxQueryRows ?? 100_000))
        throw new RangeError(
          "The storage index query exceeds the configured read bound.",
        );
      return filterRows(entityDefinition(entity), rows, query);
    },
    async close() {
      database?.close();
      database = undefined;
      opening = undefined;
    },
  };
}

/** Upgrade a stopped schema-2 database in one native versionchange transaction. */
export async function upgradeIndexedDbSchema2(
  options: IndexedDbAdapterOptions,
): Promise<void> {
  const owner = namespace(options.namespace);
  const factory = options.indexedDB ?? globalThis.indexedDB;
  if (!factory)
    throw new TypeError("IndexedDB is unavailable in this runtime.");
  const request = factory.open(
    options.databaseName ?? `polymorfa_${owner}`,
    STORAGE_SCHEMA_VERSION,
  );
  let upgraded = false;
  let blocked = false;
  let failure: unknown;
  const abort = (error: unknown) => {
    failure = error;
    request.transaction!.abort();
  };
  request.onupgradeneeded = (event) => {
    const tx = request.transaction!;
    if (blocked) {
      tx.abort();
      return;
    }
    const db = request.result;
    const expected = ENTITY_NAMES.map((name) =>
      name === "connections" ? "sessions" : name,
    ).sort();
    if (
      event.oldVersion !== 2 ||
      JSON.stringify([...db.objectStoreNames].sort()) !==
        JSON.stringify(expected)
    ) {
      abort(new TypeError("Expected a complete schema-2 storage database."));
      return;
    }
    const ownerRequest = tx.objectStore("leases").get("__storage_namespace__");
    ownerRequest.onsuccess = () => {
      if (ownerRequest.result?.owner !== owner) {
        abort(
          new TypeError(
            "The IndexedDB database belongs to a different storage namespace.",
          ),
        );
        return;
      }
      tx.objectStore("sessions").name = "connections";
      for (const entity of ENTITY_NAMES) {
        const cursorRequest = tx.objectStore(entity).openCursor();
        cursorRequest.onsuccess = () => {
          const cursor = cursorRequest.result;
          if (!cursor) return;
          if (entity === "leases" && cursor.key === "__storage_namespace__") {
            cursor.continue();
            return;
          }
          try {
            const converted = upgradeSchema2Row(
              entity,
              cursor.value as Record<string, unknown>,
            );
            cursor.update(converted.row);
            cursor.continue();
          } catch (error) {
            abort(error);
          }
        };
      }
      upgraded = true;
    };
  };
  await new Promise<void>((resolve, reject) => {
    request.onblocked = () => {
      blocked = true;
      reject(
        new Error(
          "The IndexedDB schema upgrade is blocked. Close other connections and retry.",
        ),
      );
    };
    request.onerror = () =>
      reject(failure ?? new Error("IndexedDB schema-2 upgrade failed."));
    request.onsuccess = () => {
      request.result.close();
      if (!blocked) {
        if (upgraded) resolve();
        else reject(new Error("Expected schema 2; no upgrade was performed."));
      }
    };
  });
}
