import {
  columnsOf,
  encodeKey,
  type EntityDefinition,
  type FieldType,
} from "./schema.js";
import type {
  FieldValue,
  FieldWrites,
  JsonValue,
  RowKey,
  StoredRow,
} from "./types.js";

/** Version used by revokes: content written with it can never be replaced. */
export const FINAL_VERSION = Number.MAX_SAFE_INTEGER;

/** Sorted-key JSON, so equal values always serialize the same way. */
export function canonicalJson(value: JsonValue | undefined): string {
  if (value === undefined) return "";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value))
    return `[${value.map((item) => canonicalJson(item as JsonValue)).join(",")}]`;
  const object = value as { readonly [key: string]: JsonValue };
  return `{${Object.keys(object)
    .sort()
    .filter((key) => object[key] !== undefined)
    .map((key) => `${JSON.stringify(key)}:${canonicalJson(object[key])}`)
    .join(",")}}`;
}

const TYPE_RANK = { object: 3, string: 2, number: 1, boolean: 0 } as const;

/** Total order over field values; `null` sorts lowest. */
export function compareValues(
  a: FieldValue | undefined,
  b: FieldValue | undefined,
): number {
  const nullA = a === null || a === undefined;
  const nullB = b === null || b === undefined;
  if (nullA || nullB) return nullA === nullB ? 0 : nullA ? -1 : 1;
  const rankA = TYPE_RANK[typeof a as keyof typeof TYPE_RANK] ?? 4;
  const rankB = TYPE_RANK[typeof b as keyof typeof TYPE_RANK] ?? 4;
  if (rankA !== rankB) return rankA - rankB;
  if (typeof a === "number" && typeof b === "number") return a - b;
  if (typeof a === "boolean" && typeof b === "boolean")
    return Number(a) - Number(b);
  const left = typeof a === "string" ? a : canonicalJson(a);
  const right = typeof b === "string" ? b : canonicalJson(b);
  return left < right ? -1 : left > right ? 1 : 0;
}

export function valueMatchesType(value: FieldValue, type: FieldType): boolean {
  if (value === null) return true;
  switch (type) {
    case "string":
      return typeof value === "string";
    case "number":
      return typeof value === "number" && Number.isFinite(value);
    case "boolean":
      return typeof value === "boolean";
    case "json":
      return true;
  }
}

/** A new row with every field `null`. */
export function emptyRow(definition: EntityDefinition, key: RowKey): StoredRow {
  const row: Record<string, FieldValue | Record<string, number>> = {
    _id: encodeKey(definition, key),
    _rev: 0,
    _v: {},
  };
  for (const field of definition.key) row[field] = key[field]!;
  for (const field of Object.keys(definition.fields)) row[field] = null;
  // Index sort fields are never null, so every adapter indexes every row.
  for (const index of definition.indexes) row[index.sort] = 0;
  return row as StoredRow;
}

/**
 * Merges field writes into a row. Pure: returns the merged row and whether
 * anything changed. Each field is last-writer-wins by version, ties broken by
 * `compareValues`, which makes the merge commutative and idempotent.
 */
export function mergeFields(
  definition: EntityDefinition,
  row: StoredRow,
  fields: FieldWrites,
): { readonly row: StoredRow; readonly changed: boolean } {
  let next: Record<string, unknown> | undefined;
  let versions: Record<string, number> | undefined;
  for (const [field, write] of Object.entries(fields)) {
    const type = definition.fields[field];
    if (type === undefined)
      throw new TypeError(`${definition.name} has no field ${field}`);
    if (!Number.isFinite(write.version))
      throw new TypeError(`${definition.name}.${field} needs a finite version`);
    if (!valueMatchesType(write.value, type))
      throw new TypeError(`${definition.name}.${field} must be ${type}`);
    const current = (next ?? row)[field] as FieldValue;
    const currentVersion = (versions ?? row._v)[field];
    let take: boolean;
    if (currentVersion === undefined) take = true;
    else if (write.version !== currentVersion)
      take = write.version > currentVersion;
    else take = compareValues(write.value, current) > 0;
    if (!take) continue;
    const sameValue = compareValues(write.value, current) === 0;
    if (sameValue && currentVersion === write.version) continue;
    next ??= { ...row };
    versions ??= { ...row._v };
    next[field] = write.value;
    versions[field] = write.version;
  }
  if (!next) return { row, changed: false };
  next._v = versions!;
  return { row: next as StoredRow, changed: true };
}

/** Strips system columns, for comparisons and exports. */
export function publicRow(
  definition: EntityDefinition,
  row: StoredRow,
): Record<string, FieldValue> {
  const result: Record<string, FieldValue> = {};
  for (const column of columnsOf(definition)) result[column] = row[column] ?? null;
  return result;
}
