import type { StorageAdapter } from "../types.js";
import {
  sqlAdapter,
  type BatchSqlDriver,
  type SqlAdapterOptions,
} from "./sql/core.js";

export { migrationSql, schemaStatements } from "./sql/dialect.js";
export type { SqlAdapterOptions } from "./sql/core.js";

interface D1PreparedLike {
  bind(...values: unknown[]): D1PreparedLike;
  all(): Promise<{ results?: Record<string, unknown>[]; meta?: { changes?: number } }>;
  run(): Promise<{ meta?: { changes?: number } }>;
}

/** The parts of a Cloudflare D1 binding (`env.DB`) the adapter uses. */
export interface D1DatabaseLike {
  prepare(sql: string): D1PreparedLike;
  batch(statements: D1PreparedLike[]): Promise<unknown>;
}

/**
 * Cloudflare D1 adapter. Each commit is one D1 batch, which D1 runs as a
 * single transaction. Commits are capped at 50 statements' worth of rows
 * to stay inside D1's per-batch limits.
 */
export function d1Adapter(
  database: D1DatabaseLike,
  options: SqlAdapterOptions = {},
): StorageAdapter {
  const driver: BatchSqlDriver = {
    dialect: "sqlite",
    maxBatchSize: 50,
    maxParams: 100,
    async run(sql, params) {
      const statement = database.prepare(sql).bind(...params);
      if (/^\s*(SELECT|WITH)\b/i.test(sql)) {
        const result = await statement.all();
        return { rows: result.results ?? [], affected: 0 };
      }
      const result = await statement.run();
      return { rows: [], affected: result.meta?.changes ?? 0 };
    },
    async batch(statements) {
      await database.batch(
        statements.map((statement) => database.prepare(statement.sql).bind(...statement.params)),
      );
    },
  };
  return sqlAdapter("d1", driver, options);
}
