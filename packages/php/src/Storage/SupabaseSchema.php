<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Customer-installed PostgreSQL/Supabase schema and live SELECT-only browser RLS. */
final class SupabaseSchema
{
    public static function sql(string $schema = 'public', string $tablePrefix = 'polymorfa_', string $serverRole = 'polymorfa_storage_writer', string $readerRole = 'authenticated'): string
    {
        if ($serverRole === $readerRole || in_array($serverRole, ['public','anon','authenticated'], true)) {
            throw new StorageException('storage_distinct_writer_required');
        }
        $q = static fn (string $name): string => SqlSchema::quote('postgres', $name);
        $members = $q($schema).'.'.$q($tablePrefix.'storage_memberships');
        $meta = $q($schema).'.'.$q($tablePrefix.'storage_schema');
        $out = SqlSchema::statements('postgres', $tablePrefix, $schema);
        array_push(
            $out,
            "INSERT INTO $meta (id,version) VALUES ('storage',2) ON CONFLICT(id) DO NOTHING",
            "DO \$\$ BEGIN IF (SELECT version FROM $meta WHERE id='storage') <> 2 THEN RAISE EXCEPTION 'Storage schema2 migration required'; END IF; END \$\$",
            "CREATE TABLE IF NOT EXISTS $members (session_id text NOT NULL,subject uuid NOT NULL,PRIMARY KEY(session_id,subject))",
            "ALTER TABLE $members ENABLE ROW LEVEL SECURITY",
            "ALTER TABLE $members FORCE ROW LEVEL SECURITY",
            "REVOKE ALL ON $members FROM PUBLIC",
            'GRANT USAGE ON SCHEMA '.$q($schema).' TO '.$q($readerRole).','.$q($serverRole),
            "REVOKE ALL ON $meta FROM PUBLIC",
            "GRANT SELECT ON $meta TO ".$q($serverRole),
            "GRANT SELECT ON $members TO ".$q($readerRole),
            "GRANT SELECT,INSERT,UPDATE,DELETE ON $members TO ".$q($serverRole),
            'CREATE POLICY '.$q($tablePrefix.'members_self')." ON $members FOR SELECT TO ".$q($readerRole).' USING(subject=auth.uid())',
            'CREATE POLICY '.$q($tablePrefix.'members_writer')." ON $members TO ".$q($serverRole).' USING(true) WITH CHECK(true)'
        );
        foreach (SqlSchema::ENTITIES as $entity) {
            $table = $q($schema).'.'.$q($tablePrefix.$entity);
            array_push(
                $out,
                "ALTER TABLE $table ENABLE ROW LEVEL SECURITY",
                "ALTER TABLE $table FORCE ROW LEVEL SECURITY",
                "REVOKE ALL ON $table FROM PUBLIC",
                "GRANT SELECT ON $table TO ".$q($readerRole),
                "GRANT SELECT,INSERT,UPDATE,DELETE ON $table TO ".$q($serverRole),
                'CREATE POLICY '.$q($tablePrefix.$entity.'_reader')." ON $table FOR SELECT TO ".$q($readerRole)." USING(EXISTS(SELECT 1 FROM $members m WHERE m.session_id=$table.session_id AND m.subject=auth.uid()))",
                'CREATE POLICY '.$q($tablePrefix.$entity.'_writer')." ON $table TO ".$q($serverRole).' USING(true) WITH CHECK(true)'
            );
        }
        return implode(";\n",$out).";\n";
    }
}
