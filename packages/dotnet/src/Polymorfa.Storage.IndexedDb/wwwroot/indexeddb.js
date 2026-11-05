// Schema 2, source 3bacf46f9c4213426314001586f5bae43aaa77de.
// One call owns every IndexedDB request and observes native transaction completion.
const entities = new Set([
  "sessions",
  "chats",
  "messages",
  "reactions",
  "receipts",
  "poll_votes",
  "contacts",
  "groups",
  "group_participants",
  "media",
  "labels",
  "label_associations",
  "history_chunks",
  "history_progress",
  "checkpoints",
  "events",
  "leases",
]);
const handles = new Map();
let sequence = 0;
class OwnerConflict extends Error {}

export function create(owner, databaseName, maxQueryRows) {
  if (
    !/^[A-Za-z][A-Za-z0-9_-]{0,63}$/.test(owner) ||
    (databaseName !== null &&
      (typeof databaseName !== "string" ||
        !databaseName.length ||
        databaseName.length > 256)) ||
    !Number.isInteger(maxQueryRows) ||
    maxQueryRows < 1 ||
    maxQueryRows > 100000
  )
    throw new Error("Invalid IndexedDB storage configuration.");
  const handle = ++sequence;
  handles.set(handle, {
    owner,
    name: databaseName ?? `polymorfa_${owner}`,
    maxQueryRows,
    database: null,
    opening: null,
    closed: false,
    operations: new Map(),
  });
  return handle;
}

function claimOwner(database, owner, operation) {
  return new Promise((resolve, reject) => {
    const tx = database.transaction("leases", "readwrite");
    operation.transaction = tx;
    let mismatch = false;
    tx.oncomplete = () => {
      operation.transaction = null;
      resolve();
    };
    tx.onabort = () => {
      operation.transaction = null;
      reject(
        mismatch
          ? new OwnerConflict()
          : new Error("IndexedDB owner check failed."),
      );
    };
    tx.onerror = () => {};
    try {
      const store = tx.objectStore("leases");
      const request = store.get("__storage_namespace__");
      request.onsuccess = () => {
        const current = request.result;
        if (current && current.owner !== owner) {
          mismatch = true;
          tx.abort();
        } else if (!current) store.add({ _id: "__storage_namespace__", owner });
      };
    } catch {
      try {
        tx.abort();
      } catch {}
    }
  });
}

function open(state, operation) {
  if (state.closed)
    return Promise.reject(new Error("IndexedDB adapter is closed."));
  if (state.database) return Promise.resolve(state.database);
  if (state.opening) return state.opening;
  const pending = new Promise((resolve, reject) => {
    let blocked = false;
    let request;
    try {
      request = globalThis.indexedDB.open(state.name, 2);
    } catch {
      reject(new Error("IndexedDB is unavailable."));
      return;
    }
    request.onupgradeneeded = () => {
      const tx = request.transaction;
      operation.transaction = tx;
      const clear = () => {
        if (operation.transaction === tx) operation.transaction = null;
      };
      tx.addEventListener("complete", clear);
      tx.addEventListener("abort", clear);
      if (blocked || state.closed || operation.cancelled) {
        tx.abort();
        return;
      }
      try {
        for (const entity of entities)
          if (!request.result.objectStoreNames.contains(entity))
            request.result.createObjectStore(entity, { keyPath: "_id" });
      } catch {
        try {
          tx.abort();
        } catch {}
      }
    };
    request.onblocked = () => {
      blocked = true;
      reject(new Error("IndexedDB schema upgrade is blocked."));
    };
    request.onerror = () => reject(new Error("IndexedDB could not open."));
    request.onsuccess = () => {
      if (blocked || state.closed) {
        request.result.close();
        reject(new Error("IndexedDB opening was canceled."));
      } else if (
        [...entities].some(
          (entity) => !request.result.objectStoreNames.contains(entity),
        )
      ) {
        request.result.close();
        reject(new Error("IndexedDB storage schema is incomplete."));
      } else resolve(request.result);
    };
  });
  state.opening = pending
    .then(async (database) => {
      try {
        if (operation.cancelled) throw new Error("IndexedDB opening canceled.");
        await claimOwner(database, state.owner, operation);
      } catch (error) {
        database.close();
        throw error;
      }
      if (state.closed) {
        database.close();
        throw new Error("IndexedDB adapter is closed.");
      }
      state.database = database;
      database.onversionchange = () => {
        database.close();
        if (state.database === database) {
          state.database = null;
          state.opening = null;
        }
      };
      return database;
    })
    .catch((error) => {
      state.opening = null;
      throw error;
    });
  return state.opening;
}

function transaction(database, operation, names, mode, body) {
  return new Promise((resolve) => {
    const tx = database.transaction(names, mode);
    operation.transaction = tx;
    let receipt = { status: "ok" };
    tx.oncomplete = () => {
      operation.transaction = null;
      resolve(receipt);
    };
    tx.onabort = () => {
      operation.transaction = null;
      resolve(
        operation.cancelled
          ? { status: "cancelled" }
          : receipt.status === "conflict"
            ? receipt
            : { status: "error" },
      );
    };
    tx.onerror = () => {};
    try {
      body(tx, (value) => {
        receipt = value;
      });
    } catch {
      try {
        tx.abort();
      } catch {
        resolve({ status: "error" });
      }
    }
  });
}

function table(entity) {
  if (!entities.has(entity))
    throw new Error("Unknown IndexedDB storage entity.");
  return entity;
}
function read(database, operation, payload, scan, maxQueryRows) {
  const entity = table(payload.entity);
  return transaction(
    database,
    operation,
    [entity],
    "readonly",
    (tx, finish) => {
      const store = tx.objectStore(entity);
      if (scan) {
        const count = store.count();
        count.onsuccess = () => {
          if (count.result > maxQueryRows) {
            finish({ status: "bound" });
            return;
          }
          const request = store.getAll();
          request.onsuccess = () =>
            finish({ status: "ok", rows: request.result });
        };
      } else {
        const ids = [...new Set(payload.ids)];
        const rows = new Array(ids.length);
        let remaining = ids.length;
        if (!remaining) {
          finish({ status: "ok", rows: [] });
          return;
        }
        for (let i = 0; i < ids.length; i++) {
          const request = store.get(ids[i]);
          request.onsuccess = () => {
            rows[i] = request.result;
            if (--remaining === 0)
              finish({
                status: "ok",
                rows: rows.filter((row) => row !== undefined),
              });
          };
        }
      }
    },
  );
}
function commit(database, operation, writes) {
  if (!Array.isArray(writes) || writes.length > 1000)
    throw new Error("Invalid IndexedDB commit.");
  if (!writes.length) return Promise.resolve({ status: "ok" });
  const slots = new Set();
  for (const write of writes) {
    table(write.entity);
    const id = write.kind === "put" ? write.row?._id : write.id;
    if (
      (write.kind !== "put" && write.kind !== "delete") ||
      typeof id !== "string" ||
      !id.length ||
      (write.expectedRev != null &&
        (!Number.isSafeInteger(write.expectedRev) || write.expectedRev < 1)) ||
      (write.kind === "put" &&
        (!Number.isSafeInteger(write.row._rev) || write.row._rev < 1)) ||
      slots.has(`${write.entity}\0${id}`)
    )
      throw new Error("Invalid IndexedDB conditional write.");
    slots.add(`${write.entity}\0${id}`);
  }
  return transaction(
    database,
    operation,
    [...new Set(writes.map((write) => write.entity))],
    "readwrite",
    (tx, finish) => {
      const rows = new Array(writes.length);
      let remaining = writes.length;
      // Queue all reads before returning to the event loop. Queue the writes from
      // the final read handler, while the same native transaction is active.
      for (let i = 0; i < writes.length; i++) {
        const write = writes[i];
        const request = tx
          .objectStore(write.entity)
          .get(write.kind === "put" ? write.row._id : write.id);
        request.onsuccess = () => {
          rows[i] = request.result;
          if (--remaining !== 0) return;
          const conflicts = writes
            .filter((write, index) =>
              write.kind === "put"
                ? write.expectedRev == null
                  ? rows[index] !== undefined
                  : rows[index]?._rev !== write.expectedRev
                : write.expectedRev != null &&
                  rows[index]?._rev !== write.expectedRev,
            )
            .map((write) => (write.kind === "put" ? write.row._id : write.id));
          if (conflicts.length) {
            finish({ status: "conflict", conflicts });
            tx.abort();
            return;
          }
          try {
            for (const write of writes) {
              const store = tx.objectStore(write.entity);
              if (write.kind === "put") store.put(write.row);
              else store.delete(write.id);
            }
          } catch {
            try {
              tx.abort();
            } catch {}
          }
        };
      }
    },
  );
}

export async function execute(handle, id, action, payload) {
  const state = handles.get(handle);
  if (!state || state.closed || state.operations.has(id))
    return { status: "error" };
  let release;
  const operation = {
    cancelled: false,
    transaction: null,
    done: new Promise((resolve) => {
      release = resolve;
    }),
  };
  state.operations.set(id, operation);
  try {
    const database = await open(state, operation);
    if (operation.cancelled) return { status: "cancelled" };
    if (action === "setup") return { status: "ok" };
    if (action === "get")
      return await read(
        database,
        operation,
        payload,
        false,
        state.maxQueryRows,
      );
    if (action === "scan")
      return await read(database, operation, payload, true, state.maxQueryRows);
    if (action === "commit") return await commit(database, operation, payload);
    return { status: "error" };
  } catch (error) {
    return {
      status: operation.cancelled
        ? "cancelled"
        : error instanceof OwnerConflict
          ? "owner"
          : "error",
    };
  } finally {
    state.operations.delete(id);
    release();
  }
}
export function cancel(handle, id) {
  const operation = handles.get(handle)?.operations.get(id);
  if (!operation) return;
  operation.cancelled = true;
  try {
    operation.transaction?.abort();
  } catch {}
}
export async function close(handle) {
  const state = handles.get(handle);
  if (!state) return;
  state.closed = true;
  for (const [id] of state.operations) cancel(handle, id);
  await Promise.all(
    [...state.operations.values()].map((operation) => operation.done),
  );
  if (state.opening) await state.opening.catch(() => {});
  state.database?.close();
  handles.delete(handle);
}
