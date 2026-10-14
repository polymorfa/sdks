import type { StorageAdapter } from "../types.js";
import {
  sqlAdapter,
  type InteractiveSqlDriver,
  type SqlAdapterOptions,
  type SqlParam,
  type SqlRunner,
} from "./sql/core.js";

export { migrationSql, schemaStatements } from "./sql/dialect.js";
export type { SqlAdapterOptions } from "./sql/core.js";

/** The parts of a node-postgres (`pg`) `Pool` the adapter uses. */
export interface PgPoolLike {
  query(
    text: string,
    values?: unknown[],
  ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
  connect(): Promise<{
    query(
      text: string,
      values?: unknown[],
    ): Promise<{ rows: Record<string, unknown>[]; rowCount: number | null }>;
    release(error?: Error | boolean): void;
  }>;
  end?(): Promise<void>;
}

/** The parts of a postgres.js `sql` instance the adapter uses. */
export interface PostgresJsLike {
  unsafe(
    query: string,
    parameters?: unknown[],
  ): PromiseLike<readonly Record<string, unknown>[] & { readonly count?: number }>;
  begin<T>(body: (sql: PostgresJsLike) => Promise<T>): PromiseLike<T>;
  end?(): PromiseLike<void>;
}

export interface PostgresAdapterOptions extends SqlAdapterOptions {
  /** Close the pool when the adapter closes. Default `false`. */
  readonly closeClient?: boolean;
}

const CONFLICT_CODES = new Set(["23505", "40P01", "40001"]);

function isConflict(error: unknown): boolean {
  return CONFLICT_CODES.has(String((error as { code?: unknown })?.code));
}

/**
 * PostgreSQL adapter over a node-postgres `Pool`. Each commit runs in one
 * transaction. Works with Supabase and Neon connection strings.
 */
export function postgresAdapter(
  pool: PgPoolLike,
  options: PostgresAdapterOptions = {},
): StorageAdapter {
  const runner = (client: Pick<PgPoolLike, "query">): SqlRunner => ({
    async run(sql: string, params: readonly SqlParam[]) {
      const result = await client.query(sql, [...params]);
      return { rows: result.rows ?? [], affected: result.rowCount ?? 0 };
    },
  });
  const driver: InteractiveSqlDriver = {
    dialect: "postgres",
    ...runner(pool),
    async transaction(body) {
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const result = await body(runner(client));
        await client.query("COMMIT");
        client.release();
        return result;
      } catch (error) {
        await client.query("ROLLBACK").catch(() => undefined);
        client.release();
        throw error;
      }
    },
    isConflict,
    async close() {
      if (options.closeClient) await pool.end?.();
    },
  };
  return sqlAdapter("postgres", driver, options);
}

/** PostgreSQL adapter over a postgres.js `sql` instance. */
export function postgresJsAdapter(
  sql: PostgresJsLike,
  options: PostgresAdapterOptions = {},
): StorageAdapter {
  const runner = (client: PostgresJsLike): SqlRunner => ({
    async run(text: string, params: readonly SqlParam[]) {
      const rows = await client.unsafe(text, [...params]);
      return { rows: [...rows], affected: rows.count ?? rows.length };
    },
  });
  const driver: InteractiveSqlDriver = {
    dialect: "postgres",
    ...runner(sql),
    transaction: (body) => Promise.resolve(sql.begin((tx) => body(runner(tx)))),
    isConflict,
    async close() {
      if (options.closeClient) await sql.end?.();
    },
  };
  return sqlAdapter("postgres.js", driver, options);
}
