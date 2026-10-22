import { validateCommit, validateQuery } from "../validation.js";
import {
  ENTITY_NAMES,
  entityDefinition,
  type EntityName,
} from "../../schema.js";
import type {
  CommitResult,
  FieldValue,
  IndexQuery,
  RowWrite,
  StorageAdapter,
  StorageCapabilities,
  StoredRow,
} from "../../types.js";
import { indexOf } from "../shared.js";
import {
  columnName,
  quoteIdent,
  schemaStatements,
  schemaVersionStatement,
  tableName,
  type SqlDialect,
  type SqlNaming,
} from "./dialect.js";

export type SqlParam = string | number | null;

export interface SqlStatement {
  readonly sql: string;
  readonly params: readonly SqlParam[];
}

export interface SqlQueryResult {
  readonly rows: readonly Record<string, unknown>[];
  /** Rows inserted, updated or deleted. */
  readonly affected: number;
}

export interface SqlRunner {
  run(sql: string, params: readonly SqlParam[]): Promise<SqlQueryResult>;
}

/** A driver with interactive transactions (PostgreSQL, MySQL). */
export interface InteractiveSqlDriver extends SqlRunner {
  readonly dialect: "postgres" | "mysql";
  transaction<T>(body: (tx: SqlRunner) => Promise<T>): Promise<T>;
  /** Classifies a driver error: unique violation, deadlock or similar. */
  isConflict(error: unknown): boolean;
  close?(): Promise<void>;
}

/** A driver with atomic statement batches (SQLite, libSQL, Cloudflare D1). */
export interface BatchSqlDriver extends SqlRunner {
  readonly dialect: "sqlite";
  /** Runs every statement in one transaction; rejects and rolls back on error. */
  batch(statements: readonly SqlStatement[]): Promise<void>;
  readonly maxBatchSize?: number;
  /** Bound parameters allowed in one statement. Default 900. */
  readonly maxParams?: number;
  close?(): Promise<void>;
}

export type SqlDriver = InteractiveSqlDriver | BatchSqlDriver;

export interface SqlAdapterOptions extends SqlNaming {
  /** Let `setup()` create tables and indexes. Default `true`. */
  readonly createTables?: boolean;
}

class ConflictSignal extends Error {
  constructor(readonly ids: readonly string[]) {
    super("conflict");
  }
}

function isBatchConflict(error: unknown): boolean {
  const message = String((error as { message?: unknown })?.message ?? error);
  return /UNIQUE constraint failed|NOT NULL constraint failed|constraint failed|SQLITE_CONSTRAINT/i.test(
    message,
  );
}

/** Builds a storage adapter on any of the supported SQL drivers. */
export function sqlAdapter(
  name: string,
  driver: SqlDriver,
  options: SqlAdapterOptions = {},
): StorageAdapter {
  const dialect: SqlDialect = driver.dialect;
  const q = (field: string) => quoteIdent(dialect, columnName(field));
  const table = (entity: EntityName) => tableName(dialect, entity, options);
  const guardTable = quoteIdent(
    dialect,
    `${options.tablePrefix ?? "polymorfa_"}storage_guard`,
  );
  const placeholder = (index: number, jsonCast = false) =>
    dialect === "postgres" ? `$${index}${jsonCast ? "::jsonb" : ""}` : "?";

  const encode = (value: FieldValue | undefined, json: boolean): SqlParam => {
    if (value === undefined || value === null) return null;
    if (json) return JSON.stringify(value);
    if (typeof value === "boolean")
      return dialect === "postgres"
        ? (value as unknown as SqlParam)
        : value
          ? 1
          : 0;
    return value as SqlParam;
  };

  const columnsFor = (entity: EntityName) => {
    const definition = entityDefinition(entity);
    return [
      { field: "_id", json: false },
      ...definition.key.map((field) => ({ field, json: false })),
      ...Object.entries(definition.fields).map(([field, type]) => ({
        field,
        json: type === "json",
      })),
      { field: "_rev", json: false },
      { field: "_v", json: true },
    ];
  };

  const decode = (
    entity: EntityName,
    raw: Record<string, unknown>,
  ): StoredRow => {
    const definition = entityDefinition(entity);
    // PostgreSQL and MySQL drivers return JSON columns parsed; SQLite stores text.
    const parse = (value: unknown) =>
      value === null || value === undefined
        ? null
        : dialect === "sqlite"
          ? JSON.parse(String(value))
          : value;
    const row: Record<string, unknown> = {
      _id: String(raw._id),
      _rev: Number(raw._rev),
      _v: parse(raw._v) ?? {},
    };
    for (const field of definition.key)
      row[field] = String(raw[columnName(field)]);
    for (const [field, type] of Object.entries(definition.fields)) {
      const value = raw[columnName(field)];
      if (value === null || value === undefined) row[field] = null;
      else if (type === "boolean")
        row[field] =
          value === true || value === 1 || value === "1" || value === 1n;
      else if (type === "number") row[field] = Number(value);
      else if (type === "json") row[field] = parse(value);
      else row[field] = String(value);
    }
    return row as StoredRow;
  };

  const insertStatements = (
    entity: EntityName,
    rows: readonly StoredRow[],
    ignoreConflicts: boolean,
  ): SqlStatement[] => {
    const columns = columnsFor(entity);
    const perStatement = Math.max(
      1,
      Math.floor(
        (driver.dialect === "sqlite" ? (driver.maxParams ?? 900) : 30_000) /
          columns.length,
      ),
    );
    const statements: SqlStatement[] = [];
    for (let start = 0; start < rows.length; start += perStatement) {
      const slice = rows.slice(start, start + perStatement);
      const params: SqlParam[] = [];
      const values = slice.map((row) => {
        const cells = columns.map(({ field, json }) => {
          params.push(encode(row[field] as FieldValue, json));
          return placeholder(params.length, json);
        });
        return `(${cells.join(", ")})`;
      });
      let sql = `INSERT INTO ${table(entity)} (${columns.map(({ field }) => q(field)).join(", ")}) VALUES ${values.join(", ")}`;
      if (ignoreConflicts && dialect === "postgres")
        sql += ` ON CONFLICT (${q("_id")}) DO NOTHING RETURNING ${q("_id")}`;
      statements.push({ sql, params });
    }
    return statements;
  };

  const updateStatement = (
    entity: EntityName,
    row: StoredRow,
    expectedRev: number,
  ): SqlStatement => {
    const columns = columnsFor(entity).filter(({ field }) => field !== "_id");
    const params: SqlParam[] = [];
    const sets = columns.map(({ field, json }) => {
      params.push(encode(row[field] as FieldValue, json));
      return `${q(field)} = ${placeholder(params.length, json)}`;
    });
    params.push(row._id);
    const idParam = placeholder(params.length);
    params.push(expectedRev);
    const revParam = placeholder(params.length);
    return {
      sql: `UPDATE ${table(entity)} SET ${sets.join(", ")} WHERE ${q("_id")} = ${idParam} AND ${q("_rev")} = ${revParam}`,
      params,
    };
  };

  const deleteStatement = (
    entity: EntityName,
    id: string,
    expectedRev?: number,
  ): SqlStatement => {
    const params: SqlParam[] = [id];
    let sql = `DELETE FROM ${table(entity)} WHERE ${q("_id")} = ${placeholder(1)}`;
    if (expectedRev !== undefined) {
      params.push(expectedRev);
      sql += ` AND ${q("_rev")} = ${placeholder(2)}`;
    }
    return { sql, params };
  };

  const guardStatement: SqlStatement = {
    sql: `INSERT INTO ${guardTable} (x) SELECT NULL WHERE changes() = 0`,
    params: [],
  };

  async function commitInteractive(
    interactive: InteractiveSqlDriver,
    writes: readonly RowWrite[],
  ): Promise<CommitResult> {
    try {
      await interactive.transaction(async (tx) => {
        const inserts = new Map<EntityName, StoredRow[]>();
        for (const write of writes)
          if (write.kind === "put" && write.expectedRev === null) {
            const list = inserts.get(write.entity) ?? [];
            list.push(write.row);
            inserts.set(write.entity, list);
          }
        for (const [entity, rows] of inserts) {
          for (const statement of insertStatements(entity, rows, true)) {
            if (dialect === "postgres") {
              const result = await tx.run(statement.sql, statement.params);
              const inserted = new Set(
                result.rows.map((row) => String(row._id)),
              );
              const ids = statement.params.filter(
                (_, index) => index % columnsFor(entity).length === 0,
              ) as string[];
              const missing = ids.filter((id) => !inserted.has(id));
              if (missing.length > 0) throw new ConflictSignal(missing);
            } else {
              try {
                await tx.run(statement.sql, statement.params);
              } catch (error) {
                if (interactive.isConflict(error))
                  throw new ConflictSignal(rows.map((row) => row._id));
                throw error;
              }
            }
          }
        }
        for (const write of writes) {
          if (write.kind === "put") {
            if (write.expectedRev === null) continue;
            const statement = updateStatement(
              write.entity,
              write.row,
              write.expectedRev,
            );
            const result = await tx.run(statement.sql, statement.params);
            if (result.affected === 0)
              throw new ConflictSignal([write.row._id]);
          } else {
            const statement = deleteStatement(
              write.entity,
              write.id,
              write.expectedRev,
            );
            const result = await tx.run(statement.sql, statement.params);
            if (write.expectedRev !== undefined && result.affected === 0)
              throw new ConflictSignal([write.id]);
          }
        }
      });
      return { ok: true };
    } catch (error) {
      if (error instanceof ConflictSignal)
        return { ok: false, conflicts: error.ids };
      if (interactive.isConflict(error))
        return {
          ok: false,
          conflicts: writes.map((write) =>
            write.kind === "put" ? write.row._id : write.id,
          ),
        };
      throw error;
    }
  }

  async function commitBatch(
    batchDriver: BatchSqlDriver,
    writes: readonly RowWrite[],
  ): Promise<CommitResult> {
    const statements: SqlStatement[] = [];
    const inserts = new Map<EntityName, StoredRow[]>();
    for (const write of writes)
      if (write.kind === "put" && write.expectedRev === null) {
        const list = inserts.get(write.entity) ?? [];
        list.push(write.row);
        inserts.set(write.entity, list);
      }
    for (const [entity, rows] of inserts)
      statements.push(...insertStatements(entity, rows, false));
    for (const write of writes) {
      if (write.kind === "put") {
        if (write.expectedRev === null) continue;
        statements.push(
          updateStatement(write.entity, write.row, write.expectedRev),
          guardStatement,
        );
      } else {
        statements.push(
          deleteStatement(write.entity, write.id, write.expectedRev),
        );
        if (write.expectedRev !== undefined) statements.push(guardStatement);
      }
    }
    try {
      await batchDriver.batch(statements);
      return { ok: true };
    } catch (error) {
      if (!isBatchConflict(error)) throw error;
      return {
        ok: false,
        conflicts: writes.map((write) =>
          write.kind === "put" ? write.row._id : write.id,
        ),
      };
    }
  }

  const capabilities: StorageCapabilities =
    driver.dialect === "sqlite"
      ? { atomicCommit: true, maxCommitSize: driver.maxBatchSize ?? 500 }
      : { atomicCommit: true, maxCommitSize: 1000 };

  return {
    name,
    capabilities,
    async setup() {
      if (options.createTables === false) return;
      const statements = schemaStatements(dialect, options);
      if (dialect === "sqlite")
        statements.push(
          `CREATE TABLE IF NOT EXISTS ${guardTable} (x integer NOT NULL)`,
        );
      for (const statement of statements) await driver.run(statement, []);
      await driver.run(schemaVersionStatement(dialect, options), []);
    },
    async get(entity, ids) {
      const result = new Map<string, StoredRow>();
      const readBatchSize =
        driver.dialect === "sqlite"
          ? Math.min(500, driver.maxParams ?? 900)
          : 500;
      for (let start = 0; start < ids.length; start += readBatchSize) {
        const slice = ids.slice(start, start + readBatchSize);
        if (slice.length === 0) continue;
        const marks = slice
          .map((_, index) => placeholder(index + 1))
          .join(", ");
        const { rows } = await driver.run(
          `SELECT * FROM ${table(entity)} WHERE ${q("_id")} IN (${marks})`,
          slice,
        );
        for (const raw of rows) {
          const row = decode(entity, raw);
          result.set(row._id, row);
        }
      }
      return result;
    },
    async commit(writes) {
      validateCommit(writes, capabilities.maxCommitSize);
      if (writes.length === 0) return { ok: true };
      return driver.dialect === "sqlite"
        ? commitBatch(driver, writes)
        : commitInteractive(driver, writes);
    },
    async query(entity, query: IndexQuery) {
      validateQuery(entity, query);
      const index = indexOf(entity, query.index);
      const params: SqlParam[] = [];
      const where: string[] = [];
      const add = (value: SqlParam) => {
        params.push(value);
        return placeholder(params.length);
      };
      for (const field of index.equals) {
        const value = query.equals[field];
        if (value === undefined)
          throw new TypeError(`Missing ${field} for ${index.name}`);
        where.push(`${q(field)} = ${add(value)}`);
      }
      const sort = `COALESCE(${q(index.sort)}, 0)`;
      const range = query.range ?? {};
      if (range.gt !== undefined) where.push(`${sort} > ${add(range.gt)}`);
      if (range.gte !== undefined) where.push(`${sort} >= ${add(range.gte)}`);
      if (range.lt !== undefined) where.push(`${sort} < ${add(range.lt)}`);
      if (range.lte !== undefined) where.push(`${sort} <= ${add(range.lte)}`);
      const descending = query.order === "desc";
      if (query.after) {
        const op = descending ? "<" : ">";
        where.push(
          `(${sort} ${op} ${add(query.after.sort)} OR (${sort} = ${add(query.after.sort)} AND ${q("_id")} ${op} ${add(query.after.id)}))`,
        );
      }
      const direction = descending ? "DESC" : "ASC";
      const limit = Math.max(0, Math.trunc(query.limit));
      const { rows } = await driver.run(
        `SELECT * FROM ${table(entity)} WHERE ${where.join(" AND ")} ORDER BY ${sort} ${direction}, ${q("_id")} ${direction} LIMIT ${limit}`,
        params,
      );
      return rows.map((raw) => decode(entity, raw));
    },
    async truncate() {
      for (const entity of ENTITY_NAMES)
        await driver.run(`DELETE FROM ${table(entity)}`, []);
    },
    async close() {
      await driver.close?.();
    },
  };
}
