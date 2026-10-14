<?php

declare(strict_types=1);

require_once __DIR__.'/storage_engine.php';

use Polymorfa\Storage\{Batch,Checkpoint,D1Bridge,Engine,FieldWrite,HistoryReducer,Rows,Schema,Upsert};

$endpoint = getenv('POLYMORFA_D1_BRIDGE_FIXTURE_URL');
if ($endpoint === false || $endpoint === '') {
    echo "PHP storage Engine/D1 native proof skipped: set POLYMORFA_D1_BRIDGE_FIXTURE_URL.\n";
    return;
}
$wireFixture = json_decode(file_get_contents(__DIR__.'/fixtures/d1-bridge-fixtures.json'), true, flags:JSON_THROW_ON_ERROR);
$http = null;
$host = getenv('POLYMORFA_D1_BRIDGE_FIXTURE_HOST');
if ($host !== false && $host !== '') {
    $native = GuzzleHttp\HandlerStack::create();
    $http = new GuzzleHttp\Client(['proxy' => '','handler' => static function ($request, $options) use ($host, $native) {
        storageCheck($request->getUri()->getHost() === '127.0.0.1', 'Docker retains signed logical fixture authority');
        return $native($request->withUri($request->getUri()->withHost($host), true), $options);
    }]);
}
$adapter = new D1Bridge($endpoint, $wireFixture['authority'], $wireFixture['tablePrefix'], $wireFixture['secret'], $http, timeout:30);
$adapter->setup();
$engine = new Engine($adapter);
$scope = 'php-engine-'.bin2hex(random_bytes(12));
foreach (['events','history'] as $kind) {
    $session = $scope.'-'.$kind;
    if ($kind === 'events') {
        foreach ($fixture['events'] as $event) {
            $event['session'] = $session;
            $batch = Polymorfa\Storage\EventReducer::reduce(storageEvent($event));
            storageCheck($engine->apply($batch)->applied, 'native D1 event applies');
            storageCheck(!$engine->apply($batch)->applied, 'native D1 event replay');
        } $expected = $fixture['eventRows'];
    } else {
        $batch = HistoryReducer::reduce($session, $fixture['history'], chunkId:'portable');
        storageCheck($engine->apply($batch)->applied && !$engine->apply($batch)->applied, 'native D1 history applies once');
        $expected = $fixture['historyRows'];
    }
    foreach ($expected as &$rows) {
        foreach ($rows as &$row) {
            $row['sessionId'] = $session;
        } unset($row);
    } unset($rows);
    storageExpected($engine, $expected);
}
$bulk = $scope.'-bulk';
storageCheck($engine->apply(HistoryReducer::reduce($bulk, $large, chunkId:'large'))->applied, 'native D1 2000 history applies');
$total = 0;
foreach ($large['conversations'] as $conversation) {
    $total += count($engine->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => $bulk,'chatId' => 'wa:'.$conversation['id']],'limit' => 1000])['rows']);
} storageCheck($total === 2000, 'native D1 engine stores all 2000 messages');

$session = $scope.'-cas';
$engine->apply(new Batch($session, [new Upsert('messages', ['sessionId' => $session,'messageId' => 'one'], ['text' => new FieldWrite('original', 0)])]));
$id = Schema::encodeKey('messages', ['sessionId' => $session,'messageId' => 'one']);
$before = $adapter->get('messages', [$id])[$id];
$second = Rows::empty('messages', ['sessionId' => $session,'messageId' => 'two']);
$second['_rev'] = 1;
$changed = $before;
$changed['_rev']++;
$result = $adapter->commit([['kind' => 'put','entity' => 'messages','row' => $second,'expectedRev' => null],['kind' => 'put','entity' => 'messages','row' => $changed,'expectedRev' => $before['_rev'] + 100]]);
storageCheck(!$result['ok'] && $adapter->get('messages', [$second['_id']]) === [] && $adapter->get('messages', [$id])[$id] === $before, 'actual Worker transaction rolls back earlier writes on CAS failure');
$engine->apply(new Batch($session, [new Checkpoint($session, 'events', 'one', expectedCursor:null)]));
$leaseId = Schema::encodeKey('leases', ['sessionId' => $session]);
$first = $adapter->get('leases', [$leaseId])[$leaseId];
storageRaises(fn () => $engine->apply(new Batch($session, [new Checkpoint($session, 'events', 'two', expectedCursor:null)])), 'storage_checkpoint_conflict');
storageCheck($engine->getCheckpoint($session, 'events')['cursor'] === 'one', 'native D1 stale checkpoint cannot advance');
$released = $adapter->get('leases', [$leaseId])[$leaseId];
storageCheck($released['_rev'] > $first['_rev'] && $released['owner'] === null, 'native D1 durable lease generation increases on failed attempt');
$held = $released;
$held['_rev']++;
$held['owner'] = 'synthetic-other-writer';
$held['expiresAt'] = microtime(true) * 1000 + 60000;
storageCheck($adapter->commit([['kind' => 'put','entity' => 'leases','row' => $held,'expectedRev' => $released['_rev']]])['ok'], 'native lease claim');
$competing = new Engine($adapter, leaseWaitMs:0);
storageRaises(fn () => $competing->apply(new Batch($session, [], 'denied')), 'storage_lease_lost');
storageCheck(!$engine->hasEvent($session, 'denied'), 'native held lease rejects marker');
$unlock = $held;
$unlock['_rev']++;
$unlock['owner'] = null;
$unlock['expiresAt'] = 0;
storageCheck($adapter->commit([['kind' => 'put','entity' => 'leases','row' => $unlock,'expectedRev' => $held['_rev']]])['ok'],'fixture owner releases its exact claim');
echo "PHP Engine -> actual signed Worker/D1: portable full-entity events/history, replay, 2000 messages, atomic rollback, checkpoint CAS and durable conflicting lease proof passed.\n";
