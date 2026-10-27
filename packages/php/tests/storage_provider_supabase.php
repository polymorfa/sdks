<?php

declare(strict_types=1);

require_once __DIR__.'/storage_engine.php';

use Polymorfa\Storage\{Batch,Engine,FieldWrite,Schema,SqlAdapter,SqlSchema,SupabaseSchema,Upsert};

$metadata = getenv('POLYMORFA_SUPABASE_NATIVE_FIXTURE');
if ($metadata === false || $metadata === '') {
    echo "PHP Supabase native restricted-role proof skipped.\n";
    return;
}
$native = json_decode(file_get_contents($metadata), true, flags:JSON_THROW_ON_ERROR);
storageCheck($native['syntheticOnly'] === true, 'only synthetic fixture credentials');
$pdo = new PDO($native['dsn'], $native['user'], $native['password']);
$name = 'r'.bin2hex(random_bytes(5));
$schema = $name;
$reader = $name.'_reader';
$writer = $name.'_writer';
$owner = $name.'_owner';
$pass = 'synthetic-role-for-tests';
$q = static fn (string $v): string => SqlSchema::quote('postgres', $v);
try {
    foreach ([$reader,$writer,$owner] as $role) {
        $pdo->exec('CREATE ROLE '.$q($role).' LOGIN PASSWORD '.$pdo->quote($pass));
    }
    $pdo->exec("CREATE SCHEMA IF NOT EXISTS auth; CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid LANGUAGE sql STABLE AS 'SELECT NULLIF(current_setting(''request.jwt.claim.sub'',true),'''')::uuid'");
    $pdo->exec('GRANT USAGE ON SCHEMA auth TO '.$q($reader).'; GRANT EXECUTE ON FUNCTION auth.uid() TO '.$q($reader));
    $pdo->exec(SupabaseSchema::sql($schema, 'p_', $writer, $reader));
    $write = new PDO($native['dsn'], $writer, $pass);
    $read = new PDO($native['dsn'], $reader, $pass);
    $own = new PDO($native['dsn'], $owner, $pass);
    $adapter = SqlAdapter::pdo($write, 'p_', $schema, createTables:false);
    $adapter->setup();
    $engine = new Engine($adapter);
    $engine->apply(new Batch('allowed', [new Upsert('messages', ['sessionId' => 'allowed','messageId' => 'm'], ['text' => new FieldWrite('customer-only fixture', 0)])]));
    $subject = '11111111-1111-1111-1111-111111111111';
    $write->exec('INSERT INTO '.$q($schema).'.p_storage_memberships(session_id,subject) VALUES ('.$write->quote('allowed').','.$write->quote($subject).')');
    $read->exec("SELECT set_config('request.jwt.claim.sub',".$read->quote($subject).',false)');
    $table = $q($schema).'.p_messages';
    storageCheck((int)$read->query('SELECT count(*) FROM '.$table)->fetchColumn() === 1, 'nonprivileged member reads own session');
    try {
        $read->exec("UPDATE $table SET text='forbidden'");
        throw new RuntimeException('browser write unexpectedly allowed');
    } catch (PDOException $e) {
        storageCheck($e->getCode() === '42501', 'browser writer denied by actual grants');
    }
    $read->exec("SELECT set_config('request.jwt.claim.sub','22222222-2222-2222-2222-222222222222',false)");
    storageCheck((int)$read->query('SELECT count(*) FROM '.$table)->fetchColumn() === 0, 'foreign identity cannot read');
    $read->exec("SELECT set_config('request.jwt.claim.sub',".$read->quote($subject).',false)');
    $write->exec('DELETE FROM '.$q($schema).'.p_storage_memberships');
    storageCheck((int)$read->query('SELECT count(*) FROM '.$table)->fetchColumn() === 0, 'membership revocation applies immediately to existing connection');
    $pdo->exec('GRANT USAGE ON SCHEMA '.$q($schema).' TO '.$q($owner).'; ALTER TABLE '.$table.' OWNER TO '.$q($owner));
    storageCheck((int)$own->query('SELECT count(*) FROM '.$table)->fetchColumn() === 0, 'FORCE RLS applies to non-superuser table owner');
    $count = (int)$pdo->query("SELECT count(*) FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname=".$pdo->quote($schema).' AND c.relkind=\'r\' AND c.relrowsecurity AND c.relforcerowsecurity')->fetchColumn();
    storageCheck($count === 18, '17 data tables plus membership force RLS');
    $adapter->close();
    storageCheck((int)$write->query('SELECT 1')->fetchColumn() === 1, 'restricted server PDO remains borrowed');
    storageRaises(fn () => SupabaseSchema::sql(serverRole:'authenticated'), 'storage_distinct_writer_required');
    echo "PHP actual PostgreSQL Supabase preset: restricted server schema read/setup, member SELECT, browser write denial, foreign/revoked access and FORCE RLS owner proof passed.\n";
} finally {
    $write = $read = $own = null;
    $pdo->exec('DROP SCHEMA IF EXISTS '.$q($schema).' CASCADE');
    foreach ([$reader,$writer,$owner] as $role) {
        $pdo->exec('DROP OWNED BY '.$q($role));
        $pdo->exec('DROP ROLE '.$q($role));
    }
}
