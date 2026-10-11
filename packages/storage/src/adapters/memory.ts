import { ENTITY_NAMES, entityDefinition, type EntityName } from "../schema.js";
import type {
  CommitResult,
  IndexQuery,
  RowWrite,
  StorageAdapter,
  StoredRow,
} from "../types.js";
import { clone, filterRows } from "./shared.js";

export interface MemoryAdapter extends StorageAdapter {
  /** Every row of an entity, for inspection in tests. */
  rows(entity: EntityName): StoredRow[];
}

/**
 * In-memory reference adapter. Commits are atomic. State is lost when the
 * process exits; use it for tests and as the behavior other adapters match.
 */
export function memoryAdapter(): MemoryAdapter {
  const tables = new Map<EntityName, Map<string, StoredRow>>(
    ENTITY_NAMES.map((name) => [name, new Map()]),
  );
  const table = (entity: EntityName) => {
    entityDefinition(entity);
    return tables.get(entity)!;
  };
  return {
    name: "memory",
    capabilities: { atomicCommit: true, maxCommitSize: 10_000 },
    async get(entity, ids) {
      const rows = table(entity);
      const result = new Map<string, StoredRow>();
      for (const id of ids) {
        const row = rows.get(id);
        if (row) result.set(id, clone(row));
      }
      return result;
    },
    async commit(writes: readonly RowWrite[]): Promise<CommitResult> {
      const conflicts: string[] = [];
      for (const write of writes) {
        const id = write.kind === "put" ? write.row._id : write.id;
        const current = table(write.entity).get(id);
        if (write.kind === "put") {
          if (write.expectedRev === null ? current : current?._rev !== write.expectedRev)
            conflicts.push(id);
        } else if (write.expectedRev !== undefined && current?._rev !== write.expectedRev)
          conflicts.push(id);
      }
      if (conflicts.length > 0) return { ok: false, conflicts };
      for (const write of writes) {
        if (write.kind === "put") table(write.entity).set(write.row._id, clone(write.row));
        else table(write.entity).delete(write.id);
      }
      return { ok: true };
    },
    async query(entity, query: IndexQuery) {
      return filterRows(entityDefinition(entity), table(entity).values(), query).map(
        clone,
      );
    },
    async truncate() {
      for (const rows of tables.values()) rows.clear();
    },
    rows(entity) {
      return [...table(entity).values()].map(clone);
    },
  };
}
