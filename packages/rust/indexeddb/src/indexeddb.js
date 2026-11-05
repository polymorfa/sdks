// Browser platform boundary only. Rust owns schema, validation, merge and fencing.
const request = (r) => new Promise((resolve, reject) => {
  r.onsuccess = () => resolve(r.result);
  r.onerror = () => reject(new Error("IndexedDB request failed."));
});
const live = (signal) => { if (signal.aborted) throw new Error("IndexedDB operation cancelled."); };
const done = (tx, signal) => new Promise((resolve, reject) => {
  const abort = () => { try { tx.abort(); } catch {} };
  const finish = (ok) => {
    signal.removeEventListener("abort", abort);
    if (ok) resolve(); else reject(new Error("IndexedDB transaction failed."));
  };
  tx.oncomplete = () => finish(true);
  tx.onerror = tx.onabort = () => finish(false);
  signal.addEventListener("abort", abort, { once: true });
  if (signal.aborted) abort();
});
export function newIndexedDb(owner, name, entities, maximum) {
  return new IndexedDb(owner, name, JSON.parse(entities), maximum);
}
class IndexedDb {
  constructor(owner, name, entities, maximum) {
    this.owner = owner; this.name = name; this.entities = entities;
    this.maximum = maximum; this.database = undefined; this.opening = undefined; this.generation = 0;
  }
  async open(signal) {
    live(signal);
    if (this.database) return this.database;
    if (!this.opening) {
      const generation = this.generation;
      this.opening = this.openOnce(new AbortController().signal, generation)
        .finally(() => { this.opening = undefined; });
    }
    const database = await this.opening;
    live(signal); return database;
  }
  async openOnce(signal, generation) {
    const r = globalThis.indexedDB.open(this.name, 2);
    r.onupgradeneeded = () => {
      for (const entity of this.entities)
        if (!r.result.objectStoreNames.contains(entity)) r.result.createObjectStore(entity, { keyPath: "_id" });
    };
    const database = await new Promise((resolve, reject) => {
      let blocked = false;
      r.onblocked = () => { blocked = true; reject(new Error("IndexedDB schema upgrade blocked.")); };
      r.onerror = () => reject(new Error("IndexedDB open failed."));
      r.onsuccess = () => { if (blocked || signal.aborted) { r.result.close(); reject(new Error("IndexedDB open cancelled.")); } else resolve(r.result); };
    });
    try {
      live(signal);
      const tx = database.transaction("leases", "readwrite");
      const completed = done(tx, signal);
      // Attach the handler immediately, including a rejection observer for a
      // request failure before the transaction's completion is awaited.
      completed.catch(() => {});
      const store = tx.objectStore("leases");
      const current = await request(store.get("__storage_namespace__"));
      if (current && current.owner !== this.owner) {
        tx.abort(); await completed.catch(() => {}); throw new Error("IndexedDB namespace mismatch.");
      }
      if (!current) store.add({ _id: "__storage_namespace__", owner: this.owner });
      await completed;
      if (this.generation !== generation) { database.close(); throw new Error("IndexedDB connection closed."); }
      this.database = database;
      database.onversionchange = () => { database.close(); if (this.database === database) this.database = undefined; };
      return database;
    } catch (error) { database.close(); throw error; }
  }
  close() { this.generation++; if (this.database) this.database.close(); this.database = undefined; }
  async setup(signal) { await this.open(signal); return "true"; }
  async read(entity, ids, signal) {
    const db = await this.open(signal); live(signal);
    const tx = db.transaction(entity, "readonly");
    const completed = done(tx, signal); completed.catch(() => {});
    try {
      const store = tx.objectStore(entity);
      const rows = await Promise.all(ids.map(id => request(store.get(id))));
      await completed; return rows.filter(row => row !== undefined);
    } catch (error) { try { tx.abort(); } catch {} await completed.catch(() => {}); throw error; }
  }
  async get(entity, ids, signal) { return JSON.stringify(await this.read(entity, JSON.parse(ids), signal)); }
  async commit(encoded, signal) {
    const writes = JSON.parse(encoded);
    const db = await this.open(signal); live(signal);
    const tx = db.transaction([...new Set(writes.map(w => w.entity))], "readwrite");
    const completed = done(tx, signal); completed.catch(() => {});
    try {
      // Queue all reads before yielding. Queue mutations in their final read's
      // microtask while the same readwrite transaction remains active.
      const rows = await Promise.all(writes.map(w => request(tx.objectStore(w.entity).get(w.kind === "put" ? w.row._id : w.id))));
      const conflicts = writes.flatMap((w, i) => {
        const current = rows[i];
        const mismatch = w.kind === "put"
          ? w.expectedRev === null ? current !== undefined : current?._rev !== w.expectedRev
          : w.expectedRev !== undefined && current?._rev !== w.expectedRev;
        return mismatch ? [w.kind === "put" ? w.row._id : w.id] : [];
      });
      if (conflicts.length) {
        tx.abort(); await completed.catch(() => {}); return JSON.stringify({ ok: false, conflicts });
      }
      live(signal);
      for (const w of writes) {
        const store = tx.objectStore(w.entity);
        if (w.kind === "put") store.put(w.row); else store.delete(w.id);
      }
      await completed; return JSON.stringify({ ok: true, conflicts: [] });
    } catch (error) { try { tx.abort(); } catch {} await completed.catch(() => {}); throw error; }
  }
  async scan(entity, signal) {
    const db = await this.open(signal); live(signal);
    const tx = db.transaction(entity, "readonly");
    const completed = done(tx, signal); completed.catch(() => {});
    try {
      const rows = await request(tx.objectStore(entity).getAll(undefined, this.maximum + 1));
      await completed;
      if (rows.length > this.maximum) throw new Error("IndexedDB query bound exceeded.");
      return JSON.stringify(rows);
    } catch (error) { try { tx.abort(); } catch {} await completed.catch(() => {}); throw error; }
  }
}
