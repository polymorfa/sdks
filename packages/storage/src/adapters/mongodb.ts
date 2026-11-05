import type { MongoClient, Db, Filter, Document } from "mongodb";
import { ENTITY_NAMES, entityDefinition } from "../schema.js";
import type { StorageAdapter, StoredRow } from "../types.js";
import { filterRows } from "./shared.js";
import {
  ConditionalConflict,
  conflictResult,
  namespace,
  validateCommit,
  validateQuery,
} from "./validation.js";

export interface MongoAdapterOptions {
  readonly namespace: string;
  readonly createIndexes?: boolean;
  readonly closeClient?: boolean;
  readonly maxQueryRows?: number;
}
export function mongodbAdapter(
  client: MongoClient,
  database: Db,
  options: MongoAdapterOptions,
): StorageAdapter {
  const prefix = `polymorfa_${namespace(options.namespace)}_`;
  const collection = (entity: import("../schema.js").EntityName) =>
    database.collection<StoredRow>(prefix + entity);
  return {
    name: "mongodb",
    capabilities: { atomicCommit: true, maxCommitSize: 500 },
    async setup() {
      if (options.createIndexes === false) return;
      for (const entity of ENTITY_NAMES)
        for (const index of entityDefinition(entity).indexes)
          await collection(entity).createIndex(
            Object.fromEntries(
              [...index.equals, index.sort, "_id"].map((field) => [field, 1]),
            ),
            { name: index.name },
          );
    },
    async get(entity, ids) {
      const rows = await collection(entity)
        .find({ _id: { $in: [...ids] } } as Filter<StoredRow>)
        .toArray();
      return new Map(rows.map((row) => [row._id, row]));
    },
    async commit(writes) {
      validateCommit(writes, 500);
      const session = client.startSession();
      try {
        await session.withTransaction(
          async () => {
            for (const write of writes) {
              const id = write.kind === "put" ? write.row._id : write.id;
              const current = await collection(write.entity).findOne(
                { _id: id } as Filter<StoredRow>,
                { session },
              );
              if (write.kind === "put") {
                if (
                  write.expectedRev === null
                    ? current !== null
                    : current?._rev !== write.expectedRev
                )
                  throw new ConditionalConflict([id]);
                if (write.expectedRev === null)
                  await collection(write.entity).insertOne(write.row, {
                    session,
                  });
                else {
                  const result = await collection(write.entity).replaceOne(
                    { _id: id, _rev: write.expectedRev } as Filter<StoredRow>,
                    write.row,
                    { session },
                  );
                  if (result.matchedCount !== 1)
                    throw new ConditionalConflict([id]);
                }
              } else {
                if (
                  write.expectedRev !== undefined &&
                  current?._rev !== write.expectedRev
                )
                  throw new ConditionalConflict([id]);
                await collection(write.entity).deleteOne(
                  {
                    _id: id,
                    ...(write.expectedRev === undefined
                      ? {}
                      : { _rev: write.expectedRev }),
                  } as Filter<StoredRow>,
                  { session },
                );
              }
            }
          },
          {
            readConcern: { level: "snapshot" },
            writeConcern: { w: "majority" },
          },
        );
        return { ok: true };
      } catch (error) {
        if (error instanceof ConditionalConflict) return conflictResult(error);
        if ((error as Document).code === 11000)
          return {
            ok: false,
            conflicts: writes.map((w) => (w.kind === "put" ? w.row._id : w.id)),
          };
        throw error;
      } finally {
        await session.endSession();
      }
    },
    async query(entity, query) {
      validateQuery(entity, query);
      const rows = await collection(entity)
        .find({ ...query.equals } as Filter<StoredRow>)
        .limit((options.maxQueryRows ?? 100_000) + 1)
        .toArray();
      if (rows.length > (options.maxQueryRows ?? 100_000))
        throw new RangeError(
          "The storage index query exceeds the configured read bound.",
        );
      return filterRows(entityDefinition(entity), rows, query);
    },
    async close() {
      if (options.closeClient) await client.close();
    },
  };
}
