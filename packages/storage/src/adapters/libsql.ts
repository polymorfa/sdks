import type { StorageAdapter } from "../types.js";
import {
  sqlAdapter,
  type BatchSqlDriver,
  type SqlAdapterOptions,
} from "./sql/core.js";

export { migrationSql, schemaStatements } from "./sql/dialect.js";
export type { SqlAdapterOptions } from "./sql/core.js";

/** The parts of a `@libsql/client` client the adapter uses. */
export interface LibsqlClientLike {
  execute(statement: { sql: string; args: (string | number | null)[] }): Promise<{
    columns: string[];
    rows: ArrayLike<unknown>[];
    rowsAffected: number;
  }>;
  batch(
    statements: { sql: string; args: (string | number | null)[] }[],
    mode: "write",
  ): Promise<unknown>;
  close?(): void;
}

export interface LibsqlAdapterOptions extends SqlAdapterOptions {
  readonly closeClient?: boolean;
}

/** libSQL and Turso adapter. Each commit is one atomic `write` batch. */
export function libsqlAdapter(
  client: LibsqlClientLike,
  options: LibsqlAdapterOptions = {},
): StorageAdapter {
  const driver: BatchSqlDriver = {
    dialect: "sqlite",
    async run(sql, params) {
      const result = await client.execute({ sql, args: [...params] });
      const rows = result.rows.map((row) =>
        Object.fromEntries(result.columns.map((column, index) => [column, row[index]])),
      );
      return { rows, affected: result.rowsAffected };
    },
    async batch(statements) {
      await client.batch(
        statements.map((statement) => ({ sql: statement.sql, args: [...statement.params] })),
        "write",
      );
    },
    async close() {
      if (options.closeClient) client.close?.();
    },
  };
  return sqlAdapter("libsql", driver, options);
}
