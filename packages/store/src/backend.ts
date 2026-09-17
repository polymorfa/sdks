import type { StoreName } from "./types.js";

export type InternalStoreName = StoreName | "meta";
export type Row = Record<string, unknown> & { readonly id: string };
export type KeyValue = number | string | readonly KeyValue[];

export interface IndexSpec {
  readonly name: string;
  readonly keyPath: string | readonly string[];
}

export const SCHEMA_VERSION = 1;

const timeIndex: IndexSpec = { name: "by_time", keyPath: "_t" };
const typeIndex: IndexSpec = { name: "by_type", keyPath: "type" };

export const SCHEMA: Readonly<Record<InternalStoreName, readonly IndexSpec[]>> =
  {
    conversations: [
      timeIndex,
      { name: "by_activity", keyPath: "lastActivity" },
    ],
    messages: [
      timeIndex,
      {
        name: "by_conversation",
        keyPath: ["conversationId", "createdAt"],
      },
    ],
    contacts: [timeIndex],
    presence: [timeIndex],
    calls: [timeIndex, { name: "by_started", keyPath: "startedAt" }],
    labels: [timeIndex],
    sessions: [timeIndex],
    templates: [timeIndex],
    events: [timeIndex, typeIndex],
    custom: [timeIndex, typeIndex],
    checkpoints: [],
    meta: [],
  };

export const INTERNAL_STORE_NAMES = Object.keys(SCHEMA) as InternalStoreName[];

export interface KeyRange {
  readonly lower?: KeyValue;
  readonly upper?: KeyValue;
  readonly lowerOpen?: boolean;
  readonly upperOpen?: boolean;
}

export interface Query {
  readonly index?: string;
  readonly range?: KeyRange;
  readonly direction?: "next" | "prev";
  readonly limit?: number;
  /** Applied before `limit`; sees rows as stored (possibly sealed). */
  readonly filter?: (row: Row) => boolean;
}

export type WriteOp =
  | {
      readonly kind: "put";
      readonly store: InternalStoreName;
      readonly row: Row;
    }
  | {
      readonly kind: "delete";
      readonly store: InternalStoreName;
      readonly key: string;
    }
  | {
      readonly kind: "deleteRange";
      readonly store: InternalStoreName;
      readonly index: string;
      readonly range: KeyRange;
    };

export interface SweepRule {
  readonly olderThan?: number;
  readonly maxRows?: number;
}

export interface GetRequest {
  readonly store: InternalStoreName;
  readonly key: string;
}

export interface StoreBackend {
  readonly mode: "indexeddb" | "memory";
  getMany(requests: readonly GetRequest[]): Promise<(Row | undefined)[]>;
  /** Applies all operations in one transaction; returns keys removed by ranges. */
  commit(ops: readonly WriteOp[]): Promise<Map<InternalStoreName, string[]>>;
  query(store: InternalStoreName, query: Query): Promise<Row[]>;
  /** Deletes expired and excess rows by `by_time`; returns deleted keys. */
  sweep(
    rules: ReadonlyMap<InternalStoreName, SweepRule>,
  ): Promise<Map<InternalStoreName, string[]>>;
  clear(): Promise<void>;
  close(): void;
}

/** IndexedDB key ordering for the key types this package uses. */
export function compareKeys(a: KeyValue, b: KeyValue): number {
  const rank = (value: KeyValue) =>
    typeof value === "number" ? 0 : typeof value === "string" ? 1 : 2;
  const difference = rank(a) - rank(b);
  if (difference !== 0) return difference;
  if (Array.isArray(a) && Array.isArray(b)) {
    const length = Math.min(a.length, b.length);
    for (let index = 0; index < length; index += 1) {
      const result = compareKeys(a[index] as KeyValue, b[index] as KeyValue);
      if (result !== 0) return result;
    }
    return a.length - b.length;
  }
  return a < b ? -1 : a > b ? 1 : 0;
}

export function isValidKey(value: unknown): value is KeyValue {
  if (typeof value === "number") return !Number.isNaN(value);
  if (typeof value === "string") return true;
  return Array.isArray(value) && value.every(isValidKey);
}

export function extractKey(
  row: Row,
  keyPath: string | readonly string[],
): KeyValue | undefined {
  if (typeof keyPath === "string") {
    const value = row[keyPath];
    return isValidKey(value) ? value : undefined;
  }
  const values = keyPath.map((path) => row[path]);
  return values.every(isValidKey) ? (values as KeyValue[]) : undefined;
}

export function inRange(key: KeyValue, range: KeyRange | undefined): boolean {
  if (range === undefined) return true;
  if (range.lower !== undefined) {
    const result = compareKeys(key, range.lower);
    if (result < 0 || (result === 0 && range.lowerOpen === true)) return false;
  }
  if (range.upper !== undefined) {
    const result = compareKeys(key, range.upper);
    if (result > 0 || (result === 0 && range.upperOpen === true)) return false;
  }
  return true;
}

function indexSpec(store: InternalStoreName, name: string): IndexSpec {
  const spec = SCHEMA[store].find((candidate) => candidate.name === name);
  if (spec === undefined)
    throw new Error(`Store ${store} has no index ${name}.`);
  return spec;
}

/** A bounded in-memory backend used when IndexedDB is unavailable. */
export class MemoryBackend implements StoreBackend {
  readonly mode = "memory" as const;
  readonly #stores = new Map<InternalStoreName, Map<string, Row>>(
    INTERNAL_STORE_NAMES.map((name) => [name, new Map()]),
  );

  async getMany(requests: readonly GetRequest[]) {
    return requests.map(({ store, key }) => {
      const row = this.#table(store).get(key);
      return row === undefined ? undefined : structuredClone(row);
    });
  }

  async commit(ops: readonly WriteOp[]) {
    const removed = new Map<InternalStoreName, string[]>();
    for (const op of ops) {
      const table = this.#table(op.store);
      if (op.kind === "put") table.set(op.row.id, structuredClone(op.row));
      else if (op.kind === "delete") table.delete(op.key);
      else {
        const rows = this.#indexed(op.store, op.index, op.range, "next");
        for (const row of rows) table.delete(row.id);
        const keys = removed.get(op.store) ?? [];
        keys.push(...rows.map(({ id }) => id));
        removed.set(op.store, keys);
      }
    }
    return removed;
  }

  async query(store: InternalStoreName, query: Query) {
    const rows =
      query.index === undefined
        ? [...this.#table(store).values()]
            .filter((row) => inRange(row.id, query.range))
            .sort((a, b) => compareKeys(a.id, b.id))
        : this.#indexed(store, query.index, query.range, "next");
    if (query.direction === "prev") rows.reverse();
    const result: Row[] = [];
    for (const row of rows) {
      if (query.filter !== undefined && !query.filter(row)) continue;
      result.push(structuredClone(row));
      if (query.limit !== undefined && result.length >= query.limit) break;
    }
    return result;
  }

  async sweep(rules: ReadonlyMap<InternalStoreName, SweepRule>) {
    const removed = new Map<InternalStoreName, string[]>();
    for (const [store, rule] of rules) {
      const table = this.#table(store);
      const rows = this.#indexed(store, "by_time", undefined, "next");
      const keys: string[] = [];
      let remaining = rows.length;
      for (const row of rows) {
        const expired =
          rule.olderThan !== undefined && (row._t as number) < rule.olderThan;
        const excess = rule.maxRows !== undefined && remaining > rule.maxRows;
        if (!expired && !excess) break;
        table.delete(row.id);
        keys.push(row.id);
        remaining -= 1;
      }
      if (keys.length > 0) removed.set(store, keys);
    }
    return removed;
  }

  async clear() {
    for (const table of this.#stores.values()) table.clear();
  }

  close() {
    // Nothing to release.
  }

  #table(store: InternalStoreName): Map<string, Row> {
    const table = this.#stores.get(store);
    if (table === undefined) throw new Error(`Unknown store ${store}.`);
    return table;
  }

  #indexed(
    store: InternalStoreName,
    index: string,
    range: KeyRange | undefined,
    direction: "next" | "prev",
  ): Row[] {
    const spec = indexSpec(store, index);
    const entries: { key: KeyValue; row: Row }[] = [];
    for (const row of this.#table(store).values()) {
      const key = extractKey(row, spec.keyPath);
      if (key !== undefined && inRange(key, range)) entries.push({ key, row });
    }
    entries.sort(
      (a, b) => compareKeys(a.key, b.key) || compareKeys(a.row.id, b.row.id),
    );
    const rows = entries.map(({ row }) => row);
    return direction === "prev" ? rows.reverse() : rows;
  }
}

function request<T>(target: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    target.onsuccess = () => resolve(target.result);
    target.onerror = () => reject(target.error);
  });
}

function done(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Transaction aborted."));
  });
}

function toRange(range: KeyRange | undefined): IDBKeyRange | undefined {
  if (range === undefined) return undefined;
  const { lower, upper } = range;
  if (lower !== undefined && upper !== undefined)
    return IDBKeyRange.bound(
      lower,
      upper,
      range.lowerOpen === true,
      range.upperOpen === true,
    );
  if (lower !== undefined)
    return IDBKeyRange.lowerBound(lower, range.lowerOpen === true);
  if (upper !== undefined)
    return IDBKeyRange.upperBound(upper, range.upperOpen === true);
  return undefined;
}

/** Walks a cursor; `visit` returns `false` to stop. */
function walk(
  source: IDBObjectStore | IDBIndex,
  range: IDBKeyRange | undefined,
  direction: IDBCursorDirection,
  visit: (cursor: IDBCursorWithValue) => boolean,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const cursorRequest = source.openCursor(range, direction);
    cursorRequest.onerror = () => reject(cursorRequest.error);
    cursorRequest.onsuccess = () => {
      const cursor = cursorRequest.result;
      if (cursor === null) return resolve();
      if (visit(cursor)) cursor.continue();
      else resolve();
    };
  });
}

export async function openIndexedDbBackend(
  factory: IDBFactory,
  name: string,
): Promise<IndexedDbBackend> {
  const opening = factory.open(name, SCHEMA_VERSION);
  opening.onupgradeneeded = () => {
    const database = opening.result;
    const transaction = opening.transaction;
    for (const store of INTERNAL_STORE_NAMES) {
      const objectStore = database.objectStoreNames.contains(store)
        ? transaction?.objectStore(store)
        : database.createObjectStore(store, { keyPath: "id" });
      if (objectStore === undefined) continue;
      for (const index of SCHEMA[store])
        if (!objectStore.indexNames.contains(index.name))
          objectStore.createIndex(
            index.name,
            index.keyPath as string | string[],
          );
    }
  };
  const blocked = new Promise<never>((_, reject) => {
    opening.onblocked = () =>
      reject(new Error("IndexedDB upgrade is blocked by another tab."));
  });
  const database = await Promise.race([request(opening), blocked]);
  return new IndexedDbBackend(database);
}

export class IndexedDbBackend implements StoreBackend {
  readonly mode = "indexeddb" as const;
  readonly #database: IDBDatabase;

  constructor(database: IDBDatabase) {
    this.#database = database;
    // Let another tab upgrade the schema; this tab falls back to errors.
    database.onversionchange = () => database.close();
  }

  async getMany(requests: readonly GetRequest[]) {
    if (requests.length === 0) return [];
    const stores = [...new Set(requests.map(({ store }) => store))];
    const transaction = this.#database.transaction(stores, "readonly");
    const completion = done(transaction);
    const results = await Promise.all(
      requests.map(
        ({ store, key }) =>
          request(transaction.objectStore(store).get(key)) as Promise<
            Row | undefined
          >,
      ),
    );
    await completion;
    return results;
  }

  async commit(ops: readonly WriteOp[]) {
    const removed = new Map<InternalStoreName, string[]>();
    if (ops.length === 0) return removed;
    const stores = [...new Set(ops.map(({ store }) => store))];
    const transaction = this.#database.transaction(stores, "readwrite");
    const completion = done(transaction);
    const ranges: Promise<void>[] = [];
    for (const op of ops) {
      const objectStore = transaction.objectStore(op.store);
      if (op.kind === "put") objectStore.put(op.row);
      else if (op.kind === "delete") objectStore.delete(op.key);
      else {
        const keys = removed.get(op.store) ?? [];
        removed.set(op.store, keys);
        ranges.push(
          walk(
            objectStore.index(op.index),
            toRange(op.range),
            "next",
            (cursor) => {
              keys.push((cursor.value as Row).id);
              cursor.delete();
              return true;
            },
          ),
        );
      }
    }
    await Promise.all([...ranges, completion]);
    return removed;
  }

  async query(store: InternalStoreName, query: Query) {
    const transaction = this.#database.transaction(store, "readonly");
    const completion = done(transaction);
    const objectStore = transaction.objectStore(store);
    const source =
      query.index === undefined ? objectStore : objectStore.index(query.index);
    const rows: Row[] = [];
    await walk(source, toRange(query.range), query.direction ?? "next", (c) => {
      const row = c.value as Row;
      if (query.filter === undefined || query.filter(row)) rows.push(row);
      return query.limit === undefined || rows.length < query.limit;
    });
    await completion;
    return rows;
  }

  async sweep(rules: ReadonlyMap<InternalStoreName, SweepRule>) {
    const removed = new Map<InternalStoreName, string[]>();
    if (rules.size === 0) return removed;
    const transaction = this.#database.transaction(
      [...rules.keys()],
      "readwrite",
    );
    const completion = done(transaction);
    const work = [...rules].map(async ([store, rule]) => {
      const objectStore = transaction.objectStore(store);
      const index = objectStore.index("by_time");
      const total = await request(objectStore.count());
      let remaining = total;
      const keys: string[] = [];
      await walk(index, undefined, "next", (cursor) => {
        const row = cursor.value as Row;
        const expired =
          rule.olderThan !== undefined && (row._t as number) < rule.olderThan;
        const excess = rule.maxRows !== undefined && remaining > rule.maxRows;
        if (!expired && !excess) return false;
        cursor.delete();
        keys.push(row.id);
        remaining -= 1;
        return true;
      });
      if (keys.length > 0) removed.set(store, keys);
    });
    await Promise.all([...work, completion]);
    return removed;
  }

  async clear() {
    const transaction = this.#database.transaction(
      INTERNAL_STORE_NAMES,
      "readwrite",
    );
    const completion = done(transaction);
    for (const store of INTERNAL_STORE_NAMES)
      transaction.objectStore(store).clear();
    await completion;
  }

  close() {
    this.#database.close();
  }
}
