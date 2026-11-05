import { encodeKey, entityDefinition, type EntityName } from "../schema.js";
import type {
  CommitResult,
  RowWrite,
  StoredRow,
  IndexQuery,
} from "../types.js";

export function namespace(value: string): string {
  if (typeof value !== "string" || !/^[a-zA-Z][a-zA-Z0-9_-]{0,63}$/.test(value))
    throw new TypeError(
      "A customer-owned storage namespace is required (1 to 64 letters, digits, underscores or hyphens).",
    );
  return value;
}
export function validateCommit(writes: readonly RowWrite[], max: number): void {
  if (writes.length > max)
    throw new RangeError(
      "The atomic storage commit exceeds this adapter's capacity.",
    );
  const seen = new Set<string>();
  for (const write of writes) {
    const definition = entityDefinition(write.entity);
    const id = write.kind === "put" ? write.row._id : write.id;
    const slot = `${write.entity}:${id}`;
    if (seen.has(slot))
      throw new TypeError(
        "An atomic storage commit cannot write the same row twice.",
      );
    seen.add(slot);
    if (
      write.kind === "put" &&
      (encodeKey(definition, write.row) !== id ||
        !Number.isSafeInteger(write.row._rev) ||
        write.row._rev < 1)
    )
      throw new TypeError("Invalid conditional storage row.");
    if (
      write.expectedRev !== null &&
      write.expectedRev !== undefined &&
      (!Number.isSafeInteger(write.expectedRev) || write.expectedRev < 1)
    )
      throw new TypeError("Invalid expected storage revision.");
  }
}
export function revisionConflicts(
  writes: readonly RowWrite[],
  rows: ReadonlyMap<string, StoredRow>,
): string[] {
  return writes.flatMap((write) => {
    const id = write.kind === "put" ? write.row._id : write.id;
    const current = rows.get(`${write.entity}:${id}`);
    return (
      write.kind === "put"
        ? write.expectedRev === null
          ? current !== undefined
          : current?._rev !== write.expectedRev
        : write.expectedRev !== undefined && current?._rev !== write.expectedRev
    )
      ? [id]
      : [];
  });
}
export class ConditionalConflict extends Error {
  constructor(readonly conflicts: readonly string[]) {
    super("Conditional storage conflict");
  }
}
export function conflictResult(error: ConditionalConflict): CommitResult {
  return { ok: false, conflicts: error.conflicts };
}

export function validateQuery(
  entity: import("../schema.js").EntityName,
  query: IndexQuery,
): void {
  const index = entityDefinition(entity).indexes.find(
    (value) => value.name === query.index,
  );
  if (
    !index ||
    index.equals.some(
      (field) =>
        typeof query.equals[field] !== "string" || query.equals[field] === "",
    )
  )
    throw new TypeError(
      "A storage index and all its scope values are required.",
    );
  if (
    !Number.isSafeInteger(query.limit) ||
    query.limit < 0 ||
    query.limit > 100_000
  )
    throw new RangeError(
      "A storage query limit must be an integer between zero and 100000.",
    );
  for (const value of Object.values(query.range ?? {}))
    if (!Number.isFinite(value))
      throw new TypeError("Storage index ranges must be finite.");
  if (
    query.after &&
    (!Number.isFinite(query.after.sort) ||
      typeof query.after.id !== "string" ||
      query.after.id === "")
  )
    throw new TypeError("Invalid storage page cursor.");
}

/** Reject a miswired remote adapter or corrupted row before merge planning. */
export function validateRows(entity: EntityName, value: unknown): StoredRow[] {
  const definition = entityDefinition(entity);
  if (!Array.isArray(value))
    throw new TypeError("Storage returned an invalid row collection.");
  const ids = new Set<string>();
  return value.map((row: unknown) => {
    if (!row || typeof row !== "object" || Array.isArray(row))
      throw new TypeError("Storage returned an invalid row.");
    const candidate = row as StoredRow;
    if (
      !Number.isSafeInteger(candidate._rev) ||
      candidate._rev < 1 ||
      !candidate._v ||
      typeof candidate._v !== "object" ||
      Array.isArray(candidate._v) ||
      candidate._id !== encodeKey(definition, candidate) ||
      ids.has(candidate._id)
    )
      throw new TypeError(
        "Storage returned an invalid row identity or revision.",
      );
    ids.add(candidate._id);
    return candidate;
  });
}
