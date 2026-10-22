import { ENTITY_NAMES, entityDefinition } from "../schema.js";
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
      2,
    );
    request.onupgradeneeded = () => {
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
