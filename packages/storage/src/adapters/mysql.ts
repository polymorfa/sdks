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

type MysqlResult = [unknown, unknown];

/** The parts of a `mysql2/promise` pool the adapter uses. */
export interface MysqlPoolLike {
  query(sql: string, values?: unknown[]): Promise<MysqlResult>;
  getConnection(): Promise<{
    query(sql: string, values?: unknown[]): Promise<MysqlResult>;
    beginTransaction(): Promise<void>;
    commit(): Promise<void>;
    rollback(): Promise<void>;
    release(): void;
  }>;
  end?(): Promise<void>;
}

export interface MysqlAdapterOptions extends SqlAdapterOptions {
  readonly closeClient?: boolean;
}

/** Duplicate key, deadlock, lock wait timeout. */
const CONFLICT_ERRORS = new Set([1062, 1213, 1205]);

/**
 * MySQL adapter over a `mysql2/promise` pool (MySQL 8, PlanetScale).
 * Each commit runs in one InnoDB transaction.
 */
export function mysqlAdapter(
  pool: MysqlPoolLike,
  options: MysqlAdapterOptions = {},
): StorageAdapter {
  const runner = (client: Pick<MysqlPoolLike, "query">): SqlRunner => ({
    async run(sql: string, params: readonly SqlParam[]) {
      const [result] = await client.query(sql, [...params]);
      if (Array.isArray(result))
        return { rows: result as Record<string, unknown>[], affected: 0 };
      return {
        rows: [],
        affected: Number(
          (result as { affectedRows?: number }).affectedRows ?? 0,
        ),
      };
    },
  });
  const driver: InteractiveSqlDriver = {
    dialect: "mysql",
    ...runner(pool),
    async transaction(body) {
      const connection = await pool.getConnection();
      try {
        await connection.beginTransaction();
        const result = await body(runner(connection));
        await connection.commit();
        return result;
      } catch (error) {
        await connection.rollback().catch(() => undefined);
        throw error;
      } finally {
        connection.release();
      }
    },
    isConflict: (error) =>
      CONFLICT_ERRORS.has(Number((error as { errno?: unknown })?.errno)),
    async close() {
      if (options.closeClient) await pool.end?.();
    },
  };
  return sqlAdapter("mysql", driver, options);
}
