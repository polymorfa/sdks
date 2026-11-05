import type { Firestore } from "@google-cloud/firestore";
import { entityDefinition } from "../schema.js";
import type { StorageAdapter, StoredRow } from "../types.js";
import { filterRows } from "./shared.js";
import {
  ConditionalConflict,
  conflictResult,
  namespace,
  validateCommit,
  validateQuery,
} from "./validation.js";

export interface FirestoreAdapterOptions {
  readonly namespace: string;
  readonly maxQueryRows?: number;
  readonly closeClient?: boolean;
}
export function firestoreAdapter(
  database: Firestore,
  options: FirestoreAdapterOptions,
): StorageAdapter {
  const prefix = `polymorfa_${namespace(options.namespace)}_`;
  const collection = (entity: import("../schema.js").EntityName) =>
    database.collection(prefix + entity);
  return {
    name: "firestore",
    capabilities: { atomicCommit: true, maxCommitSize: 250 },
    async get(entity, ids) {
      const rows = new Map<string, StoredRow>();
      for (let start = 0; start < ids.length; start += 250) {
        const refs = ids
          .slice(start, start + 250)
          .map((id) => collection(entity).doc(id));
        if (!refs.length) continue;
        for (const snapshot of await database.getAll(...refs))
          if (snapshot.exists) {
            const row = snapshot.data() as StoredRow;
            rows.set(row._id, row);
          }
      }
      return rows;
    },
    async commit(writes) {
      validateCommit(writes, 250);
      try {
        await database.runTransaction(async (transaction) => {
          const refs = writes.map((write) =>
            collection(write.entity).doc(
              write.kind === "put" ? write.row._id : write.id,
            ),
          );
          const snapshots = refs.length
            ? await transaction.getAll(...refs)
            : [];
          for (let index = 0; index < writes.length; index++) {
            const write = writes[index]!;
            const current = snapshots[index]?.data() as StoredRow | undefined;
            const id = write.kind === "put" ? write.row._id : write.id;
            if (
              write.kind === "put"
                ? write.expectedRev === null
                  ? current !== undefined
                  : current?._rev !== write.expectedRev
                : write.expectedRev !== undefined &&
                  current?._rev !== write.expectedRev
            )
              throw new ConditionalConflict([id]);
          }
          for (let index = 0; index < writes.length; index++) {
            const write = writes[index]!;
            const ref = refs[index]!;
            if (write.kind === "put") {
              if (write.expectedRev === null)
                transaction.create(ref, write.row);
              else transaction.set(ref, write.row);
            } else transaction.delete(ref);
          }
        });
        return { ok: true };
      } catch (error) {
        if (error instanceof ConditionalConflict) return conflictResult(error);
        throw error;
      }
    },
    async query(entity, query) {
      validateQuery(entity, query);
      let selected: FirebaseFirestore.Query = collection(entity);
      const index = entityDefinition(entity).indexes.find(
        (item) => item.name === query.index,
      );
      if (!index) throw new TypeError("Unknown storage index.");
      for (const field of index.equals) {
        if (query.equals[field] === undefined)
          throw new TypeError("A storage index equality value is required.");
        selected = selected.where(field, "==", query.equals[field]);
      }
      const snapshot = await selected
        .limit((options.maxQueryRows ?? 100_000) + 1)
        .get();
      if (snapshot.size > (options.maxQueryRows ?? 100_000))
        throw new RangeError(
          "The storage index query exceeds the configured read bound.",
        );
      return filterRows(
        entityDefinition(entity),
        snapshot.docs.map((doc) => doc.data() as StoredRow),
        query,
      );
    },
    async close() {
      if (options.closeClient) await database.terminate();
    },
  };
}
