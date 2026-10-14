import {
  ENTITY_NAMES,
  STORAGE_SCHEMA,
  STORAGE_SCHEMA_VERSION,
  type EntityDefinition,
  type EntityName,
  type FieldType,
} from "../../schema.js";

export type SqlDialect = "postgres" | "mysql" | "sqlite";

export interface SqlNaming {
  /** Table name prefix. Default `polymorfa_`. */
  readonly tablePrefix?: string;
  /** PostgreSQL schema. Default: the connection's search path. */
  readonly schema?: string;
}

export function quoteIdent(dialect: SqlDialect, name: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    throw new TypeError(`Invalid SQL identifier: ${name}`);
  return dialect === "mysql" ? `\`${name}\`` : `"${name}"`;
}

/** Column names are the schema's camelCase names converted to snake_case. */
export function columnName(field: string): string {
  if (field.startsWith("_")) return field;
  return field.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`);
}

export function tableName(
  dialect: SqlDialect,
  entity: EntityName,
  naming: SqlNaming = {},
): string {
  const table = quoteIdent(
    dialect,
    `${naming.tablePrefix ?? "polymorfa_"}${entity}`,
  );
  return naming.schema && dialect === "postgres"
    ? `${quoteIdent(dialect, naming.schema)}.${table}`
    : table;
}

function columnType(
  dialect: SqlDialect,
  type: FieldType | "key" | "id",
): string {
  switch (dialect) {
    case "postgres":
      return {
        key: "text",
        id: 'text COLLATE "C"',
        string: "text",
        number: "double precision",
        boolean: "boolean",
        json: "jsonb",
      }[type];
    case "mysql":
      return {
        key: "varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin",
        id: "varchar(1024) CHARACTER SET ascii COLLATE ascii_bin",
        string: "mediumtext",
        number: "double",
        boolean: "tinyint(1)",
        json: "json",
      }[type];
    case "sqlite":
      return {
        key: "text",
        id: "text",
        string: "text",
        number: "real",
        boolean: "integer",
        json: "text",
      }[type];
  }
}

/** `CREATE TABLE`/`CREATE INDEX` statements for every entity, idempotent. */
export function schemaStatements(
  dialect: SqlDialect,
  naming: SqlNaming = {},
): string[] {
  const statements: string[] = [];
  if (naming.schema && dialect === "postgres")
    statements.push(
      `CREATE SCHEMA IF NOT EXISTS ${quoteIdent(dialect, naming.schema)}`,
    );
  for (const entity of ENTITY_NAMES)
    statements.push(
      ...tableStatements(dialect, STORAGE_SCHEMA[entity], naming),
    );
  const meta = metaTable(dialect, naming);
  statements.push(
    `CREATE TABLE IF NOT EXISTS ${meta} (${quoteIdent(dialect, "id")} ${columnType(dialect, "key")} PRIMARY KEY, ${quoteIdent(dialect, "version")} integer NOT NULL)`,
  );
  return statements;
}

export function metaTable(dialect: SqlDialect, naming: SqlNaming = {}): string {
  const table = quoteIdent(
    dialect,
    `${naming.tablePrefix ?? "polymorfa_"}storage_schema`,
  );
  return naming.schema && dialect === "postgres"
    ? `${quoteIdent(dialect, naming.schema)}.${table}`
    : table;
}

/** Records the schema version; part of every migration. */
export function schemaVersionStatement(
  dialect: SqlDialect,
  naming: SqlNaming = {},
): string {
  const meta = metaTable(dialect, naming);
  const id = quoteIdent(dialect, "id");
  const version = quoteIdent(dialect, "version");
  switch (dialect) {
    case "postgres":
      return `INSERT INTO ${meta} (${id}, ${version}) VALUES ('storage', ${STORAGE_SCHEMA_VERSION}) ON CONFLICT (${id}) DO UPDATE SET ${version} = EXCLUDED.${version}`;
    case "mysql":
      return `INSERT INTO ${meta} (${id}, ${version}) VALUES ('storage', ${STORAGE_SCHEMA_VERSION}) ON DUPLICATE KEY UPDATE ${version} = VALUES(${version})`;
    case "sqlite":
      return `INSERT INTO ${meta} (${id}, ${version}) VALUES ('storage', ${STORAGE_SCHEMA_VERSION}) ON CONFLICT (${id}) DO UPDATE SET ${version} = excluded.${version}`;
  }
}

function tableStatements(
  dialect: SqlDialect,
  definition: EntityDefinition,
  naming: SqlNaming,
): string[] {
  const q = (name: string) => quoteIdent(dialect, columnName(name));
  const table = tableName(dialect, definition.name, naming);
  const columns = [
    `${q("_id")} ${columnType(dialect, "id")} NOT NULL PRIMARY KEY`,
    ...definition.key.map(
      (field) => `${q(field)} ${columnType(dialect, "key")} NOT NULL`,
    ),
    ...Object.entries(definition.fields).map(
      ([field, type]) =>
        `${q(field)} ${columnType(dialect, dialect === "mysql" && type === "string" && definition.indexes.some((index) => index.equals.includes(field)) ? "key" : type)}`,
    ),
    `${q("_rev")} bigint NOT NULL`,
    `${q("_v")} ${columnType(dialect, "json")} NOT NULL`,
  ];
  const indexName = (name: string) =>
    quoteIdent(
      dialect,
      `${naming.tablePrefix ?? "polymorfa_"}${definition.name}_${name}`,
    );
  const indexColumns = (fields: readonly string[]) => fields.map(q).join(", ");
  if (dialect === "mysql") {
    for (const index of definition.indexes)
      columns.push(
        `KEY ${indexName(index.name)} (${indexColumns([...index.equals, index.sort, "_id"])})`,
      );
    columns.push(
      `UNIQUE KEY ${indexName("key")} (${indexColumns(definition.key)})`,
    );
    return [
      `CREATE TABLE IF NOT EXISTS ${table} (\n  ${columns.join(",\n  ")}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin`,
    ];
  }
  const statements = [
    `CREATE TABLE IF NOT EXISTS ${table} (\n  ${columns.join(",\n  ")}\n)`,
  ];
  for (const index of definition.indexes)
    statements.push(
      `CREATE INDEX IF NOT EXISTS ${indexName(index.name)} ON ${table} (${indexColumns([...index.equals, index.sort, "_id"])})`,
    );
  return statements;
}

/** A complete migration script: schema plus the version record. */
export function migrationSql(
  dialect: SqlDialect,
  naming: SqlNaming = {},
): string {
  return (
    [
      ...schemaStatements(dialect, naming),
      schemaVersionStatement(dialect, naming),
    ]
      .map((statement) => `${statement};`)
      .join("\n\n") + "\n"
  );
}
