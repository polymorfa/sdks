package storage

import (
	"strings"
)

type SupabaseOptions struct {
	Schema      string
	TablePrefix string
	ServerRole  string
	ReaderRole  string
}

// SupabaseSchema exports SQL for the customer to install with its own database
// administrator. Browser roles get live-membership SELECT only; the server writer
// remains distinct. This never connects to or modifies a hosted Polymorfa DB.
func SupabaseSchema(settings SupabaseOptions) (string, error) {
	if settings.Schema == "" {
		settings.Schema = "public"
	}
	if settings.ServerRole == "" {
		settings.ServerRole = "polymorfa_storage_writer"
	}
	if settings.ReaderRole == "" {
		settings.ReaderRole = "authenticated"
	}
	if !sqlIdentifier.MatchString(settings.ServerRole) || !sqlIdentifier.MatchString(settings.ReaderRole) || len(settings.ServerRole) > 63 || len(settings.ReaderRole) > 63 || settings.ServerRole == settings.ReaderRole {
		return "", invalid()
	}
	switch strings.ToLower(settings.ServerRole) {
	case "public", "anon", "authenticated":
		return "", storageError("storage_distinct_writer_required")
	}
	options, err := sqlOptions(PostgreSQL, SQLOptions{Schema: settings.Schema, TablePrefix: settings.TablePrefix})
	if err != nil {
		return "", err
	}
	statements, err := SQLSchemaStatements(PostgreSQL, options)
	if err != nil {
		return "", err
	}
	q := func(name string) string { return sqlQuote(PostgreSQL, name) }
	writer, reader := q(settings.ServerRole), q(settings.ReaderRole)
	members := sqlTable(PostgreSQL, "storage_memberships", options)
	meta := sqlTable(PostgreSQL, "storage_schema", options)
	statements = append(statements, "INSERT INTO "+meta+" (id,version) VALUES ('storage',2) ON CONFLICT (id) DO NOTHING", "DO $$ BEGIN IF (SELECT version FROM "+meta+" WHERE id='storage') <> 2 THEN RAISE EXCEPTION 'Storage schema2 migration required'; END IF; END $$", "CREATE TABLE IF NOT EXISTS "+members+" (session_id text NOT NULL, subject uuid NOT NULL, PRIMARY KEY (session_id,subject))", "ALTER TABLE "+members+" ENABLE ROW LEVEL SECURITY", "ALTER TABLE "+members+" FORCE ROW LEVEL SECURITY", "REVOKE ALL ON "+members+" FROM PUBLIC", "GRANT USAGE ON SCHEMA "+q(options.Schema)+" TO "+reader+", "+writer, "REVOKE ALL ON "+meta+" FROM PUBLIC", "GRANT SELECT ON "+meta+" TO "+writer, "GRANT SELECT ON "+members+" TO "+reader, "GRANT SELECT,INSERT,UPDATE,DELETE ON "+members+" TO "+writer, "CREATE POLICY "+q(options.TablePrefix+"members_self")+" ON "+members+" FOR SELECT TO "+reader+" USING (subject=auth.uid())", "CREATE POLICY "+q(options.TablePrefix+"members_writer")+" ON "+members+" TO "+writer+" USING (true) WITH CHECK (true)")
	for _, entity := range sqlEntities() {
		table := sqlTable(PostgreSQL, entity, options)
		statements = append(statements, "ALTER TABLE "+table+" ENABLE ROW LEVEL SECURITY", "ALTER TABLE "+table+" FORCE ROW LEVEL SECURITY", "REVOKE ALL ON "+table+" FROM PUBLIC", "GRANT SELECT ON "+table+" TO "+reader, "GRANT SELECT,INSERT,UPDATE,DELETE ON "+table+" TO "+writer, "CREATE POLICY "+q(options.TablePrefix+entity+"_reader")+" ON "+table+" FOR SELECT TO "+reader+" USING (EXISTS (SELECT 1 FROM "+members+" m WHERE m.session_id="+table+".session_id AND m.subject=auth.uid()))", "CREATE POLICY "+q(options.TablePrefix+entity+"_writer")+" ON "+table+" TO "+writer+" USING (true) WITH CHECK (true)")
	}
	return strings.Join(statements, ";\n") + ";\n", nil
}
