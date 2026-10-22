import {
  defineTable,
  defineSchema,
  type DataModelFromSchemaDefinition,
  type GenericMutationCtx,
  type GenericQueryCtx,
  type FunctionReference,
} from "convex/server";
import { v } from "convex/values";
import { entityDefinition, type EntityName } from "../schema.js";
import type {
  StorageAdapter,
  StoredRow,
  RowWrite,
  IndexQuery,
  CommitResult,
} from "../types.js";
import { filterRows } from "./shared.js";
import {
  namespace,
  validateCommit,
  validateRows,
  validateQuery,
} from "./validation.js";

export const convexStorageSchema = defineSchema({
  polymorfaStorage: convexStorageTable(),
});
export type ConvexStorageDataModel = DataModelFromSchemaDefinition<
  typeof convexStorageSchema
>;
type QueryContext = GenericQueryCtx<ConvexStorageDataModel>;
type MutationContext = GenericMutationCtx<ConvexStorageDataModel>;
export interface ConvexStorageOptions {
  /** Derive the tenant from trusted server identity. Never return a browser-supplied namespace. */ readonly resolveNamespace: (
    context: QueryContext | MutationContext,
  ) => string | Promise<string>;
  readonly maxQueryRows?: number;
}
/** Add this definition to the application's defineSchema. */
export function convexStorageTable() {
  return defineTable({
    namespace: v.string(),
    entity: v.string(),
    rowId: v.string(),
    row: v.any(),
  })
    .index("by_identity", ["namespace", "entity", "rowId"])
    .index("by_namespace_entity", ["namespace", "entity"]);
}
/** Handlers run inside the application's query/mutation transactions. The
 * application owns function registration, authentication and tenant selection. */
export function convexStorageHandlers(options: ConvexStorageOptions) {
  const table = "polymorfaStorage" as const;
  const owner = async (ctx: QueryContext | MutationContext) =>
    namespace(await options.resolveNamespace(ctx));
  const find = (
    ctx: QueryContext | MutationContext,
    tenant: string,
    entity: EntityName,
    id: string,
  ) =>
    ctx.db
      .query(table)
      .withIndex("by_identity", (q) =>
        q.eq("namespace", tenant).eq("entity", entity).eq("rowId", id),
      )
      .unique();
  return {
    async get(ctx: QueryContext, args: { entity: EntityName; ids: string[] }) {
      entityDefinition(args.entity);
      const tenant = await owner(ctx);
      const rows: StoredRow[] = [];
      for (const id of args.ids) {
        const doc = await find(ctx, tenant, args.entity, id);
        if (doc) rows.push(doc.row as StoredRow);
      }
      return rows;
    },
    async commit(
      ctx: MutationContext,
      args: { writes: RowWrite[] },
    ): Promise<CommitResult> {
      validateCommit(args.writes, 500);
      const tenant = await owner(ctx);
      const current = await Promise.all(
        args.writes.map((write) =>
          find(
            ctx,
            tenant,
            write.entity,
            write.kind === "put" ? write.row._id : write.id,
          ),
        ),
      );
      const conflicts: string[] = [];
      for (let index = 0; index < args.writes.length; index++) {
        const write = args.writes[index]!;
        const row = current[index]?.row as StoredRow | undefined;
        if (
          write.kind === "put"
            ? write.expectedRev === null
              ? row !== undefined
              : row?._rev !== write.expectedRev
            : write.expectedRev !== undefined && row?._rev !== write.expectedRev
        )
          conflicts.push(write.kind === "put" ? write.row._id : write.id);
      }
      if (conflicts.length) return { ok: false, conflicts };
      for (let index = 0; index < args.writes.length; index++) {
        const write = args.writes[index]!;
        const existing = current[index];
        if (write.kind === "put") {
          const doc = {
            namespace: tenant,
            entity: write.entity,
            rowId: write.row._id,
            row: JSON.parse(
              JSON.stringify(write.row),
            ) as import("convex/values").Value,
          };
          if (existing) await ctx.db.replace(existing._id, doc);
          else await ctx.db.insert(table, doc);
        } else if (existing) await ctx.db.delete(existing._id);
      }
      return { ok: true };
    },
    async query(
      ctx: QueryContext,
      args: { entity: EntityName; query: IndexQuery },
    ) {
      validateQuery(args.entity, args.query);
      const definition = entityDefinition(args.entity);
      const tenant = await owner(ctx);
      const docs = await ctx.db
        .query(table)
        .withIndex("by_namespace_entity", (q) =>
          q.eq("namespace", tenant).eq("entity", args.entity),
        )
        .take((options.maxQueryRows ?? 100_000) + 1);
      if (docs.length > (options.maxQueryRows ?? 100_000))
        throw new RangeError(
          "The storage index query exceeds the configured read bound.",
        );
      return filterRows(
        definition,
        docs.map((doc) => doc.row as StoredRow),
        args.query,
      );
    },
  };
}
export interface ConvexClientLike {
  query(
    reference: FunctionReference<"query">,
    args: Record<string, unknown>,
  ): Promise<unknown>;
  mutation(
    reference: FunctionReference<"mutation">,
    args: Record<string, unknown>,
  ): Promise<unknown>;
}
export interface ConvexAdapterReferences {
  readonly get: FunctionReference<"query">;
  readonly commit: FunctionReference<"mutation">;
  readonly query: FunctionReference<"query">;
}
export function convexAdapter(
  client: ConvexClientLike,
  references: ConvexAdapterReferences,
): StorageAdapter {
  return {
    name: "convex",
    capabilities: { atomicCommit: true, maxCommitSize: 500 },
    async get(entity, ids) {
      const rows = validateRows(
        entity,
        await client.query(references.get, { entity, ids: [...ids] }),
      );
      if (rows.some((row) => !ids.includes(row._id)))
        throw new TypeError("Convex returned an unrequested storage identity.");
      return new Map(rows.map((row) => [row._id, row]));
    },
    async commit(writes) {
      validateCommit(writes, 500);
      const result = await client.mutation(references.commit, {
        writes: [...writes],
      });
      if (
        !result ||
        typeof result !== "object" ||
        !("ok" in result) ||
        typeof result.ok !== "boolean" ||
        (!result.ok &&
          (!("conflicts" in result) ||
            !Array.isArray(result.conflicts) ||
            result.conflicts.some((id: unknown) => typeof id !== "string")))
      )
        throw new TypeError(
          "Convex returned an invalid conditional commit receipt.",
        );
      return result as CommitResult;
    },
    async query(entity, query) {
      validateQuery(entity, query);
      const rows = validateRows(
        entity,
        await client.query(references.query, { entity, query }),
      );
      return filterRows(entityDefinition(entity), rows, query);
    },
  };
}
