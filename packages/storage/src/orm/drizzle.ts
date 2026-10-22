import {
  pgTable,
  pgSchema,
  text,
  doublePrecision,
  boolean,
  jsonb,
  bigint,
  index,
  type AnyPgColumn,
  type PgColumnBuilderBase,
} from "drizzle-orm/pg-core";
import {
  mysqlTable,
  varchar,
  mediumtext,
  double,
  boolean as mysqlBoolean,
  json,
  bigint as mysqlBigint,
  index as mysqlIndex,
  type MySqlColumnBuilderBase,
} from "drizzle-orm/mysql-core";
import {
  sqliteTable,
  text as sqliteText,
  real,
  integer,
  index as sqliteIndex,
  type SQLiteColumnBuilderBase,
} from "drizzle-orm/sqlite-core";
import { ENTITY_NAMES, entityDefinition } from "../schema.js";
import { columnName } from "../adapters/sql/dialect.js";
export interface DrizzleSchemaOptions {
  readonly tablePrefix?: string;
  readonly schema?: string;
}
export function drizzlePostgresSchema(options: DrizzleSchemaOptions = {}) {
  return Object.fromEntries(
    ENTITY_NAMES.map((entity) => {
      const def = entityDefinition(entity);
      const prefix = options.tablePrefix ?? "polymorfa_";
      const columns: Record<string, PgColumnBuilderBase> = {
        _id: text("_id").primaryKey(),
        _rev: bigint("_rev", { mode: "number" }).notNull(),
        _v: jsonb("_v").notNull(),
      };
      for (const key of def.key) columns[key] = text(columnName(key)).notNull();
      for (const [field, type] of Object.entries(def.fields))
        columns[field] =
          type === "string"
            ? text(columnName(field))
            : type === "number"
              ? doublePrecision(columnName(field))
              : type === "boolean"
                ? boolean(columnName(field))
                : jsonb(columnName(field));
      const indexes = (table: Record<string, AnyPgColumn>) =>
        def.indexes.map((defIndex) =>
          index(`${prefix}${entity}_${defIndex.name}`).on(
            table[defIndex.equals[0]!]!,
            ...[...defIndex.equals.slice(1), defIndex.sort, "_id"].map(
              (field) => table[field]!,
            ),
          ),
        );
      const table =
        options.schema && options.schema !== "public"
          ? pgSchema(options.schema).table(prefix + entity, columns, indexes)
          : pgTable(prefix + entity, columns, indexes);
      return [entity, table] as const;
    }),
  );
}
export function drizzleMysqlSchema(options: DrizzleSchemaOptions = {}) {
  return Object.fromEntries(
    ENTITY_NAMES.map((entity) => {
      const def = entityDefinition(entity);
      const prefix = options.tablePrefix ?? "polymorfa_";
      const columns: Record<string, MySqlColumnBuilderBase> = {
        _id: varchar("_id", { length: 1024 }).primaryKey(),
        _rev: mysqlBigint("_rev", { mode: "number" }).notNull(),
        _v: json("_v").notNull(),
      };
      for (const key of def.key)
        columns[key] = varchar(columnName(key), { length: 191 }).notNull();
      for (const [field, type] of Object.entries(def.fields))
        columns[field] =
          type === "string"
            ? def.indexes.some((index) => index.equals.includes(field))
              ? varchar(columnName(field), { length: 191 })
              : mediumtext(columnName(field))
            : type === "number"
              ? double(columnName(field))
              : type === "boolean"
                ? mysqlBoolean(columnName(field))
                : json(columnName(field));
      const table = mysqlTable(prefix + entity, columns, (table) =>
        def.indexes.map((defIndex) =>
          mysqlIndex(`${prefix}${entity}_${defIndex.name}`).on(
            table[defIndex.equals[0]!]!,
            ...[...defIndex.equals.slice(1), defIndex.sort, "_id"].map(
              (field) => table[field]!,
            ),
          ),
        ),
      );
      return [entity, table] as const;
    }),
  );
}
export function drizzleSqliteSchema(options: DrizzleSchemaOptions = {}) {
  return Object.fromEntries(
    ENTITY_NAMES.map((entity) => {
      const def = entityDefinition(entity);
      const prefix = options.tablePrefix ?? "polymorfa_";
      const columns: Record<string, SQLiteColumnBuilderBase> = {
        _id: sqliteText("_id").primaryKey(),
        _rev: integer("_rev").notNull(),
        _v: sqliteText("_v", { mode: "json" }).notNull(),
      };
      for (const key of def.key)
        columns[key] = sqliteText(columnName(key)).notNull();
      for (const [field, type] of Object.entries(def.fields))
        columns[field] =
          type === "json"
            ? sqliteText(columnName(field), { mode: "json" })
            : type === "boolean"
              ? integer(columnName(field), { mode: "boolean" })
              : type === "number"
                ? real(columnName(field))
                : sqliteText(columnName(field));
      const table = sqliteTable(prefix + entity, columns, (table) =>
        def.indexes.map((defIndex) =>
          sqliteIndex(`${prefix}${entity}_${defIndex.name}`).on(
            table[defIndex.equals[0]!]!,
            ...[...defIndex.equals.slice(1), defIndex.sort, "_id"].map(
              (field) => table[field]!,
            ),
          ),
        ),
      );
      return [entity, table] as const;
    }),
  );
}
