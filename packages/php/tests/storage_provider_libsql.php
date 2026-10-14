<?php

declare(strict_types=1);

require_once __DIR__.'/storage_engine.php';

use Polymorfa\Storage\{Batch,Checkpoint,Engine,EventReducer,FieldWrite,HistoryReducer,LibsqlDriver,Rows,Schema,SqlAdapter,SqlSchema,Upsert};

$autoload = getenv('POLYMORFA_LIBSQL_NATIVE_AUTOLOAD');
if ($autoload === false || $autoload === '') {
    echo "PHP official libSQL native proof skipped (optional PHP8.3+FFI driver).\n";
    return;
}
require_once $autoload;
$databases = ['file' => new Libsql\Database(path:':memory:')];
$endpoint = getenv('POLYMORFA_LIBSQL_NATIVE_URL');
if ($endpoint !== false && $endpoint !== '') {
    $databases['remote'] = new Libsql\Database(url:$endpoint);
}
foreach ($databases as $mode => $database) {
    $connection = $database->connect();
    $driver = new LibsqlDriver($connection);
    $prefix = 'l'.bin2hex(random_bytes(5)).'_';
    $adapter = new SqlAdapter($driver, $prefix);
    $adapter->setup();
    $engine = new Engine($adapter, leaseDurationMs:120000);
    // Regression: official CharBox falsey-string binding must never reach C.
    $roundtrip = $driver->run("SELECT '?' AS literal,? AS empty,? AS zero,? AS bound /* ? */", ['','0',"quoted ' ? ; -- stays bound"])->rows[0];
    storageCheck($roundtrip === ['literal' => '?','empty' => '','zero' => '0','bound' => "quoted ' ? ; -- stays bound"], 'empty/zero binding and SQL quotes/comments preserve exact text');
    storageRaises(fn () => $driver->run('SELECT ? AS value', []), 'invalid_storage_sql_parameters');
    foreach (['events','history'] as $kind) {
        if ($kind === 'events') {
            foreach ($fixture['events'] as $row) {
                $batch = EventReducer::reduce(storageEvent($row));
                storageCheck($engine->apply($batch)->applied && !$engine->apply($batch)->applied, 'official libSQL '.$mode.' event replay');
            } $expected = $fixture['eventRows'];
        } else {
            $batch = HistoryReducer::reduce('portable-fixture', $fixture['history'], chunkId:'portable');
            storageCheck($engine->apply($batch)->applied && !$engine->apply($batch)->applied, 'official libSQL '.$mode.' history replay');
            $expected = $fixture['historyRows'];
        } storageExpected($engine, $expected);
    }
    $engine->apply(HistoryReducer::reduce('large', $large, chunkId:'large'));
    $count = 0;
    foreach ($large['conversations'] as $conversation) {
        $count += count($engine->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 'large','chatId' => 'wa:'.$conversation['id']],'limit' => 1000])['rows']);
    } storageCheck($count === 2000, 'official libSQL '.$mode.' 2000 history');
    $engine->apply(new Batch('cas', [new Upsert('messages', ['sessionId' => 'cas','messageId' => 'one'], ['text' => new FieldWrite('original', 0)])]));
    $id = Schema::encodeKey('messages', ['sessionId' => 'cas','messageId' => 'one']);
    $before = $adapter->get('messages', [$id])[$id];
    $two = Rows::empty('messages', ['sessionId' => 'cas','messageId' => 'two']);
    $two['_rev'] = 1;
    $changed = $before;
    $changed['_rev']++;
    storageCheck(!$adapter->commit([['kind' => 'put','entity' => 'messages','row' => $two,'expectedRev' => null],['kind' => 'put','entity' => 'messages','row' => $changed,'expectedRev' => $before['_rev'] + 100]])['ok'] && $adapter->get('messages', [$two['_id']]) === [] && $adapter->get('messages', [$id])[$id] === $before, 'official libSQL '.$mode.' actual atomic rollback');
    $engine->apply(new Batch('cas', [new Checkpoint('cas', 'events', 'one', expectedCursor:null)]));
    storageRaises(fn () => $engine->apply(new Batch('cas', [new Checkpoint('cas', 'events', 'two', expectedCursor:null)])), 'storage_checkpoint_conflict');
    storageCheck($engine->getCheckpoint('cas', 'events')['cursor'] === 'one', 'official libSQL '.$mode.' checkpoint CAS');
    $connection->execute('BEGIN IMMEDIATE');
    try {
        $adapter->setup();
        throw new RuntimeException('libSQL caller transaction must be refused');
    } catch (Polymorfa\Storage\StorageException) {
    } storageCheck($connection->query('SELECT 1 AS n')->fetchArray()[0]['n'] === 1, 'borrowed libSQL transaction remains usable');
    $connection->execute('ROLLBACK');
    $adapter->setup();
    foreach ([...SqlSchema::ENTITIES,'storage_schema'] as $entity) {
        $connection->execute('DROP TABLE '.SqlSchema::quote('sqlite', $prefix.$entity));
    }
    $adapter->close();
    storageCheck($connection->query('SELECT 1 AS n')->fetchArray()[0]['n'] === 1,'closing adapter preserves borrowed official libSQL connection');
    echo 'PHP official turso/libsql '.$mode." driver: native full fixtures,2000 history,actual rollback/checkpoint and borrowed transaction/connection proof passed.\n";
}
