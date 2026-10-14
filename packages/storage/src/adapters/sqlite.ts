import type { StorageAdapter } from "../types.js";
import {
  sqlAdapter,
  type BatchSqlDriver,
  type SqlAdapterOptions,
  type SqlParam,
} from "./sql/core.js";

export { migrationSql, schemaStatements } from "./sql/dialect.js";
export type { SqlAdapterOptions } from "./sql/core.js";

/** A `node:sqlite` `DatabaseSync` or a `better-sqlite3` `Database`. */
export interface SqliteDatabaseLike {
  prepare(sql: string): {
    all(...params: SqlParam[]): unknown[];
    run(...params: SqlParam[]): { changes: number | bigint };
  };
  exec(sql: string): void;
  close?(): void;
}

export interface SqliteAdapterOptions extends SqlAdapterOptions {
  readonly closeClient?: boolean;
}

const READS = /^\s*(SELECT|WITH)\b/i;

/**
 * SQLite adapter over a synchronous driver (`node:sqlite`, `better-sqlite3`).
 * Each commit runs in one `BEGIN IMMEDIATE` transaction.
 */
export function sqliteAdapter(
  database: SqliteDatabaseLike,
  options: SqliteAdapterOptions = {},
): StorageAdapter {
  const run = (sql: string, params: readonly SqlParam[]) => {
    const statement = database.prepare(sql);
    if (READS.test(sql))
      return {
        rows: statement.all(...params) as Record<string, unknown>[],
        affected: 0,
      };
    return { rows: [], affected: Number(statement.run(...params).changes) };
  };
  const driver: BatchSqlDriver = {
    dialect: "sqlite",
    async run(sql, params) {
      return run(sql, params);
    },
    async batch(statements) {
      database.exec("BEGIN IMMEDIATE");
      try {
        for (const statement of statements)
          run(statement.sql, statement.params);
        database.exec("COMMIT");
      } catch (error) {
        database.exec("ROLLBACK");
        throw error;
      }
    },
    async close() {
      if (options.closeClient) database.close?.();
    },
  };
  return sqlAdapter("sqlite", driver, options);
}
