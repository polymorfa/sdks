<?php

declare(strict_types=1);

require_once __DIR__.'/../vendor/autoload.php';

use Polymorfa\Storage\{SqlAdapter,StorageException};

function connectionStorageRefused(Closure $action): void
{
    try {
        $action();
    } catch (StorageException) {
        return;
    }
    throw new RuntimeException('Storage must reject an unverified schema.');
}

foreach ([2,4] as $version) {
    $db = new PDO('sqlite::memory:');
    $db->exec("CREATE TABLE polymorfa_storage_schema(id text PRIMARY KEY,version integer); INSERT INTO polymorfa_storage_schema VALUES('storage',$version); CREATE TABLE polymorfa_sessions(session_id text); INSERT INTO polymorfa_sessions VALUES('unchanged-selector')");
    $before = $db->query('SELECT name,sql FROM sqlite_master ORDER BY name')->fetchAll(PDO::FETCH_ASSOC);
    connectionStorageRefused(fn () => SqlAdapter::pdo($db)->setup());
    if ($before !== $db->query('SELECT name,sql FROM sqlite_master ORDER BY name')->fetchAll(PDO::FETCH_ASSOC) || $db->query('SELECT session_id FROM polymorfa_sessions')->fetchColumn() !== 'unchanged-selector') {
        throw new RuntimeException('Rejected storage was modified.');
    }
}
$db = new PDO('sqlite::memory:');
$db->exec('CREATE TABLE polymorfa_messages(_id text)');
connectionStorageRefused(fn () => SqlAdapter::pdo($db)->setup());
if ($db->query("SELECT count(*) FROM sqlite_master WHERE type='table'")->fetchColumn() !== 1) {
    throw new RuntimeException('Unversioned existing storage was initialized.');
}
$db = new PDO('sqlite::memory:');
$adapter = SqlAdapter::pdo($db);
$adapter->setup();
$db->exec('UPDATE polymorfa_storage_schema SET version=4');
connectionStorageRefused(fn () => $adapter->get('connections', []));
echo "PHP schema-3 guards: old/future stores unchanged, unversioned tables refused, open-adapter reads fenced.\n";
