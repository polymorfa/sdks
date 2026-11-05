const held = new Map();
let restore;
export function report(result) {
  globalThis.fixtureResult = result;
  parent.postMessage({ polymorfaIndexedDbFixture: true, result }, "*");
}
export async function prepareVersion1(name, row, keepOpen = false) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () =>
      request.result.createObjectStore("messages", { keyPath: "_id" });
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(new Error("Fixture version-1 open failed."));
  });
  if (row)
    await new Promise((resolve, reject) => {
      const tx = database.transaction("messages", "readwrite");
      tx.oncomplete = resolve;
      tx.onabort = reject;
      tx.objectStore("messages").put(row);
    });
  if (keepOpen) held.set(name, database);
  else database.close();
}
export function releaseVersion1(name) {
  held.get(name)?.close();
  held.delete(name);
}
export async function inspect(name) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  const result = {
    version: database.version,
    stores: [...database.objectStoreNames],
  };
  database.close();
  return result;
}
export function armCancelOnFirstWrite(callback) {
  disarm();
  const original = IDBObjectStore.prototype.put;
  IDBObjectStore.prototype.put = function (...args) {
    const request = original.apply(this, args);
    disarm();
    callback.invokeMethodAsync("Cancel");
    return request;
  };
  restore = () => {
    IDBObjectStore.prototype.put = original;
  };
}
export function armCancelAfterComplete(callback) {
  disarm();
  const original = IDBDatabase.prototype.transaction;
  IDBDatabase.prototype.transaction = function (...args) {
    const tx = original.apply(this, args);
    if (args[1] === "readwrite") {
      disarm();
      tx.addEventListener("complete", () =>
        callback.invokeMethodAsync("Cancel"),
      );
    }
    return tx;
  };
  restore = () => {
    IDBDatabase.prototype.transaction = original;
  };
}
export function disarm() {
  restore?.();
  restore = null;
}
export function assertDenied() {
  try {
    indexedDB.open("polymorfa_denied_origin_probe");
    return false;
  } catch (error) {
    return error instanceof DOMException && error.name === "SecurityError";
  }
}

export function opaqueOrigin(name) {
  return new Promise((resolve, reject) => {
    const frame = document.createElement("iframe");
    frame.sandbox = "allow-scripts";
    frame.title = "Native C# WASM storage denial fixture";
    const url = new URL(location.href);
    url.search = new URLSearchParams({ id: name + "_denied", denied: "1" });
    frame.src = url.href;
    let timer;
    const finish = (error, result) => {
      clearTimeout(timer);
      window.removeEventListener("message", listener);
      frame.remove();
      if (error) reject(error);
      else resolve(result);
    };
    const listener = (event) => {
      if (
        event.source === frame.contentWindow &&
        event.data?.polymorfaIndexedDbFixture
      )
        finish(null, event.data.result);
    };
    window.addEventListener("message", listener);
    timer = setTimeout(
      () => finish(new Error("Native opaque-origin fixture did not complete.")),
      30000,
    );
    document.body.append(frame);
  });
}

export function armCancelOnOwnerAdd(callback) {
  disarm();
  const original = IDBObjectStore.prototype.add;
  IDBObjectStore.prototype.add = function (...args) {
    const request = original.apply(this, args);
    disarm();
    callback.invokeMethodAsync("Cancel");
    return request;
  };
  restore = () => {
    IDBObjectStore.prototype.add = original;
  };
}

export async function publicRows(name) {
  const database = await new Promise((resolve, reject) => {
    const request = indexedDB.open(name);
    request.onsuccess = () => resolve(request.result);
    request.onerror = reject;
  });
  try {
    return await new Promise((resolve, reject) => {
      const names = [...database.objectStoreNames].filter(
        (name) => name !== "events" && name !== "leases",
      );
      const tx = database.transaction(names, "readonly");
      const result = {};
      tx.oncomplete = () => resolve(result);
      tx.onabort = () => reject(new Error("Native fixture snapshot failed."));
      for (const name of names) {
        const request = tx.objectStore(name).getAll();
        request.onsuccess = () => {
          result[name] = request.result.map(
            ({ _id, _rev, _v, ...fields }) => fields,
          );
        };
      }
    });
  } finally {
    database.close();
  }
}
