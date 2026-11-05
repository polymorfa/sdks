"""Customer-installed PostgreSQL FORCE RLS preset; no browser write authority."""

from __future__ import annotations

from .core import ENTITY_NAMES, STORAGE_SCHEMA_VERSION
from .sql import sql_schema_statements
from .sqlite import quote_identifier


def supabase_preset(
    *,
    schema: str = "public",
    table_prefix: str = "polymorfa_",
    server_role: str = "polymorfa_storage_writer",
    reader_role: str = "authenticated",
) -> str:
    if server_role in (reader_role, "public", "anon", "authenticated"):
        raise ValueError("The storage writer must be a distinct trusted server role")
    q = quote_identifier
    members = q(schema) + "." + q(table_prefix + "storage_memberships")
    meta = q(schema) + "." + q(table_prefix + "storage_schema")
    statements = sql_schema_statements("postgres", table_prefix=table_prefix, schema=schema)
    # The operator must inspect/apply migrations separately. Never overwrite an old version.
    statements.extend(
        [
            f"INSERT INTO {meta} (id,version) VALUES ('storage',{STORAGE_SCHEMA_VERSION}) ON CONFLICT (id) DO NOTHING",
            f"DO $$ BEGIN IF (SELECT version FROM {meta} WHERE id='storage') <> {STORAGE_SCHEMA_VERSION} THEN RAISE EXCEPTION 'Storage schema2 migration required'; END IF; END $$",
            f"CREATE TABLE IF NOT EXISTS {members} (session_id text NOT NULL,subject uuid NOT NULL,PRIMARY KEY(session_id,subject))",
            f"ALTER TABLE {members} ENABLE ROW LEVEL SECURITY",
            f"ALTER TABLE {members} FORCE ROW LEVEL SECURITY",
            f"REVOKE ALL ON {members} FROM PUBLIC",
            f"GRANT USAGE ON SCHEMA {q(schema)} TO {q(reader_role)},{q(server_role)}",
            f"REVOKE ALL ON {meta} FROM PUBLIC",
            f"GRANT SELECT ON {meta} TO {q(server_role)}",
            f"GRANT SELECT ON {members} TO {q(reader_role)}",
            f"GRANT SELECT,INSERT,UPDATE,DELETE ON {members} TO {q(server_role)}",
            f"CREATE POLICY {q(table_prefix + 'members_self')} ON {members} FOR SELECT TO {q(reader_role)} USING(subject=auth.uid())",
            f"CREATE POLICY {q(table_prefix + 'members_writer')} ON {members} TO {q(server_role)} USING(true) WITH CHECK(true)",
        ]
    )
    for entity in ENTITY_NAMES:
        table = q(schema) + "." + q(table_prefix + entity)
        statements.extend(
            [
                f"ALTER TABLE {table} ENABLE ROW LEVEL SECURITY",
                f"ALTER TABLE {table} FORCE ROW LEVEL SECURITY",
                f"REVOKE ALL ON {table} FROM PUBLIC",
                f"GRANT SELECT ON {table} TO {q(reader_role)}",
                f"GRANT SELECT,INSERT,UPDATE,DELETE ON {table} TO {q(server_role)}",
                f"CREATE POLICY {q(table_prefix + entity + '_reader')} ON {table} FOR SELECT TO {q(reader_role)} USING(EXISTS(SELECT 1 FROM {members} m WHERE m.session_id={table}.session_id AND m.subject=auth.uid()))",
                f"CREATE POLICY {q(table_prefix + entity + '_writer')} ON {table} TO {q(server_role)} USING(true) WITH CHECK(true)",
            ]
        )
    return ";\n".join(statements) + ";\n"
