import { ENTITY_NAMES } from "../schema.js";
import {
  schemaStatements,
  schemaVersionStatement,
  tableName,
  quoteIdent,
  type SqlNaming,
} from "./sql/dialect.js";

export interface SupabasePresetOptions extends SqlNaming {
  readonly serverRole?: string;
  readonly readerRole?: string;
}
/** Customer database SQL. The caller installs this using its own administrative
 * connection. Browser roles read only sessions authorized by live membership;
 * no browser role receives storage write or membership-management authority. */
export function supabasePreset(options: SupabasePresetOptions = {}): string {
  const schema = options.schema ?? "public";
  const prefix = options.tablePrefix ?? "polymorfa_";
  const q = (value: string) => quoteIdent("postgres", value);
  const members = `${q(schema)}.${q(`${prefix}storage_memberships`)}`;
  const writer = options.serverRole ?? "polymorfa_storage_writer";
  const reader = options.readerRole ?? "authenticated";
  const statements = [
    ...schemaStatements("postgres", { ...options, schema }),
    schemaVersionStatement("postgres", { ...options, schema }),
    `CREATE TABLE IF NOT EXISTS ${members} (session_id text NOT NULL, subject uuid NOT NULL, PRIMARY KEY (session_id, subject))`,
    `ALTER TABLE ${members} ENABLE ROW LEVEL SECURITY`,
    `ALTER TABLE ${members} FORCE ROW LEVEL SECURITY`,
    `REVOKE ALL ON ${members} FROM PUBLIC`,
    `GRANT USAGE ON SCHEMA ${q(schema)} TO ${q(reader)}, ${q(writer)}`,
    `GRANT SELECT ON ${members} TO ${q(reader)}`,
    `GRANT SELECT, INSERT, UPDATE, DELETE ON ${members} TO ${q(writer)}`,
    `CREATE POLICY ${q(`${prefix}members_self`)} ON ${members} FOR SELECT TO ${q(reader)} USING (subject = auth.uid())`,
    `CREATE POLICY ${q(`${prefix}members_writer`)} ON ${members} TO ${q(writer)} USING (true) WITH CHECK (true)`,
  ];
  for (const entity of ENTITY_NAMES) {
    const table = tableName("postgres", entity, { ...options, schema });
    statements.push(
      `ALTER TABLE ${table} ENABLE ROW LEVEL SECURITY`,
      `ALTER TABLE ${table} FORCE ROW LEVEL SECURITY`,
      `REVOKE ALL ON ${table} FROM PUBLIC`,
      `GRANT SELECT ON ${table} TO ${q(reader)}`,
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ${table} TO ${q(writer)}`,
      `CREATE POLICY ${q(`${prefix}${entity}_reader`)} ON ${table} FOR SELECT TO ${q(reader)} USING (EXISTS (SELECT 1 FROM ${members} m WHERE m.session_id = ${table}.session_id AND m.subject = auth.uid()))`,
      `CREATE POLICY ${q(`${prefix}${entity}_writer`)} ON ${table} TO ${q(writer)} USING (true) WITH CHECK (true)`,
    );
  }
  return statements.join(";\n") + ";\n";
}
