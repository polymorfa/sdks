<?php

declare(strict_types=1);

require_once __DIR__.'/storage_engine.php';

use Polymorfa\Storage\{Batch,Checkpoint,Engine,EventReducer,FieldWrite,HistoryReducer,Rows,Schema,SqlAdapter,SqlSchema,Upsert};

$connections = ['sqlite' => new PDO('sqlite::memory:')];
$metadata = getenv('POLYMORFA_STORAGE_SQL_FIXTURE');
if ($metadata !== false && $metadata !== '') {
    $native = json_decode(file_get_contents($metadata), true, flags:JSON_THROW_ON_ERROR);
    $host = getenv('POLYMORFA_STORAGE_SQL_HOST');
    $pg = parse_url($native['postgres']);
    parse_str($pg['query'] ?? '', $pgOptions);
    $connections['postgres'] = new PDO('pgsql:host='.($host ?: $pg['host']).';port='.$pg['port'].';dbname='.ltrim($pg['path'], '/').';sslmode='.($pgOptions['sslmode'] ?? 'disable'), urldecode($pg['user']), urldecode($pg['pass'] ?? ''));
    storageCheck(preg_match('/^(.*?):(.*?)@tcp\((.*):(\d+)\)\/([^?]+)(?:\?.*)?$/D', $native['mysql'], $my) === 1, 'synthetic MySQL fixture shape');
    $connections['mysql'] = new PDO('mysql:host='.($host ?: $my[3]).';port='.$my[4].';dbname='.$my[5].';charset=utf8mb4', $my[1], $my[2]);
}
foreach ($connections as $dialect => $pdo) {
    $prefix = 'p'.bin2hex(random_bytes(5)).'_';
    $adapter = SqlAdapter::pdo($pdo, $prefix);
    storageCheck(!$adapter->capabilities()['atomicCommit'], 'SQL requires verified setup before capability');
    $adapter->setup();
    $engine = new Engine($adapter);
    foreach (['events','history'] as $kind) {
        if ($kind === 'events') {
            foreach ($fixture['events'] as $row) {
                $batch = EventReducer::reduce(storageEvent($row));
                storageCheck($engine->apply($batch)->applied && !$engine->apply($batch)->applied, 'native '.$dialect.' event replay');
            } $expected = $fixture['eventRows'];
        } else {
            $batch = HistoryReducer::reduce('portable-fixture', $fixture['history'], chunkId:'portable');
            storageCheck($engine->apply($batch)->applied && !$engine->apply($batch)->applied, 'native '.$dialect.' history replay');
            $expected = $fixture['historyRows'];
        }
        storageExpected($engine, $expected);
    }
    $engine->apply(HistoryReducer::reduce('large', $large, chunkId:'large'));
    $count = 0;
    foreach ($large['conversations'] as $conversation) {
        $count += count($engine->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 'large','chatId' => 'wa:'.$conversation['id']],'limit' => 1000])['rows']);
    } storageCheck($count === 2000, 'native '.$dialect.' 2000 messages');
    $engine->apply(new Batch('cas', [new Upsert('messages', ['sessionId' => 'cas','messageId' => 'one'], ['text' => new FieldWrite('original', 0)])]));
    $id = Schema::encodeKey('messages', ['sessionId' => 'cas','messageId' => 'one']);
    $before = $adapter->get('messages', [$id])[$id];
    $two = Rows::empty('messages', ['sessionId' => 'cas','messageId' => 'two']);
    $two['_rev'] = 1;
    $changed = $before;
    $changed['_rev']++;
    storageCheck(!$adapter->commit([['kind' => 'put','entity' => 'messages','row' => $two,'expectedRev' => null],['kind' => 'put','entity' => 'messages','row' => $changed,'expectedRev' => $before['_rev'] + 100]])['ok'], 'native '.$dialect.' conditional rejection');
    storageCheck($adapter->get('messages', [$two['_id']]) === [] && $adapter->get('messages', [$id])[$id] === $before, 'native '.$dialect.' transaction rollback');
    $engine->apply(new Batch('cas', [new Checkpoint('cas', 'events', 'one', expectedCursor:null)]));
    storageRaises(fn () => $engine->apply(new Batch('cas', [new Checkpoint('cas', 'events', 'two', expectedCursor:null)])), 'storage_checkpoint_conflict');
    storageCheck($engine->getCheckpoint('cas', 'events')['cursor'] === 'one', 'native '.$dialect.' checkpoint retained');
    // No revision-free delete can evade the same-session lease CAS in its transaction.
    storageRaises(fn () => $adapter->commit([['kind' => 'delete','entity' => 'messages','id' => $id]]), 'storage_delete_revision_required');
    $leaseId = Schema::encodeKey('leases', ['sessionId' => 'cas']);
    $lease = $adapter->get('leases', [$leaseId])[$leaseId];
    $next = $lease;
    $next['_rev']++;
    storageCheck($adapter->commit([['kind' => 'delete','entity' => 'messages','id' => $id],['kind' => 'put','entity' => 'leases','row' => $next,'expectedRev' => $lease['_rev']]])['ok'] && $adapter->get('messages', [$id]) === [], 'native '.$dialect.' same-session fenced child delete');
    $pdo->beginTransaction();
    storageRaises(fn () => $adapter->setup(), 'storage_borrowed_transaction_active');
    storageCheck($pdo->inTransaction(), 'setup never commits caller transaction');
    $pdo->rollBack();
    $adapter->setup();
    $quote = static fn (string $name): string => SqlSchema::quote($dialect, $name);
    $pdo->exec('UPDATE '.$quote($prefix.'storage_schema').' SET '.$quote('version').'=1');
    storageRaises(fn () => $adapter->setup(), 'storage_schema_mismatch');
    storageCheck((int)$pdo->query('SELECT '.$quote('version').' FROM '.$quote($prefix.'storage_schema'))->fetchColumn() === 1, 'schema mismatch never overwrites version');
    $pdo->exec('UPDATE '.$quote($prefix.'storage_schema').' SET '.$quote('version').'=2');
    $adapter->setup();
    if ($dialect === 'mysql') {
        $mode = $pdo->query('SELECT @@SESSION.sql_mode')->fetchColumn();
        $pdo->exec("SET SESSION sql_mode=''");
        storageRaises(fn () => $adapter->commit([['kind' => 'put','entity' => 'messages','row' => $two,'expectedRev' => null]]), 'storage_mysql_strict_mode_required');
        $pdo->exec('SET SESSION sql_mode='.$pdo->quote($mode));
        // MyISAM's own 1000-byte key ceiling requires a smaller synthetic key
        // before constructing the nontransactional negative fixture.
        $pdo->exec('ALTER TABLE '.$quote($prefix.'sessions').' MODIFY '.$quote('_id').' varchar(191) CHARACTER SET ascii COLLATE ascii_bin NOT NULL, ENGINE=MyISAM');
        storageRaises(fn () => $adapter->setup(), 'storage_mysql_innodb_required');
        $pdo->exec('ALTER TABLE '.$quote($prefix.'sessions').' ENGINE=InnoDB');
        $pdo->exec('ALTER TABLE '.$quote($prefix.'sessions').' MODIFY '.$quote('_id').' varchar(1024) CHARACTER SET ascii COLLATE ascii_bin NOT NULL');
        $adapter->setup();
    }
    $adapter->close();
    storageCheck(!$adapter->capabilities()['atomicCommit'] && (int)$pdo->query('SELECT 1')->fetchColumn() === 1, 'closing '.$dialect.' adapter preserves borrowed PDO');
    foreach ([...SqlSchema::ENTITIES,'storage_schema'] as $entity) {
        $pdo->exec('DROP TABLE '.$quote($prefix.$entity));
    }
    echo 'PHP native '.$dialect." PDO: full fixtures,2000 history,rollback/checkpoint,fenced delete,nested transaction,version/ownership checks passed.\n";
}
