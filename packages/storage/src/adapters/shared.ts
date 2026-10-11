import {
  entityDefinition,
  type EntityDefinition,
  type EntityName,
  type IndexDefinition,
} from "../schema.js";
import type { IndexQuery, StoredRow } from "../types.js";

export function indexOf(entity: EntityName, name: string): IndexDefinition {
  const index = entityDefinition(entity).indexes.find((item) => item.name === name);
  if (!index) throw new TypeError(`${entity} has no index named ${name}`);
  return index;
}

/** Applies an index query to rows in memory. Used by in-process adapters. */
export function filterRows(
  definition: EntityDefinition,
  rows: Iterable<StoredRow>,
  query: IndexQuery,
): StoredRow[] {
  const index = indexOf(definition.name, query.index);
  const descending = query.order === "desc";
  const range = query.range ?? {};
  const matched: StoredRow[] = [];
  for (const row of rows) {
    if (!index.equals.every((field) => row[field] === query.equals[field]))
      continue;
    const sort = Number(row[index.sort] ?? 0);
    if (range.gt !== undefined && !(sort > range.gt)) continue;
    if (range.gte !== undefined && !(sort >= range.gte)) continue;
    if (range.lt !== undefined && !(sort < range.lt)) continue;
    if (range.lte !== undefined && !(sort <= range.lte)) continue;
    if (query.after) {
      const cmp = compareSortId(sort, row._id, query.after.sort, query.after.id);
      if (descending ? cmp >= 0 : cmp <= 0) continue;
    }
    matched.push(row);
  }
  matched.sort((a, b) => {
    const cmp = compareSortId(
      Number(a[index.sort] ?? 0),
      a._id,
      Number(b[index.sort] ?? 0),
      b._id,
    );
    return descending ? -cmp : cmp;
  });
  return matched.slice(0, query.limit);
}

export function compareSortId(
  sortA: number,
  idA: string,
  sortB: number,
  idB: string,
): number {
  if (sortA !== sortB) return sortA < sortB ? -1 : 1;
  return idA < idB ? -1 : idA > idB ? 1 : 0;
}

/** Fixed-width, order-preserving text form of a sort value (KV stores). */
export function sortableNumber(value: number): string {
  // Sort fields are non-negative integers (timestamps, ranks, orders).
  const safe = Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.trunc(value)));
  return safe.toString().padStart(16, "0");
}

export function clone<T>(value: T): T {
  return structuredClone(value);
}
