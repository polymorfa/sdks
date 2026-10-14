<?php

declare(strict_types=1);

use Polymorfa\Storage\{D1Bridge,Schema,StorageException};

$fixture = json_decode(file_get_contents(__DIR__.'/fixtures/d1-bridge-fixtures.json'), true, flags:JSON_THROW_ON_ERROR);
$sign = static fn (string $s): string => 'v1='.hash_hmac('sha256', $s, $fixture['secret']);
check($sign($fixture['nonce'].'.'.$fixture['request']['method'].'.'.$fixture['request']['path'].'.'.$fixture['request']['rawBody']) === $fixture['request']['signature'], 'Independent request HMAC vector');
check($sign($fixture['nonce'].'.'.$fixture['response']['status'].'.'.$fixture['response']['rawBody']) === $fixture['response']['signature'], 'Independent response HMAC vector');
foreach (['valid','authority','prefix','schema','capabilities','nonce','signature','body','unsigned','redirect','oversize','stall'] as $mode) {
    $process = proc_open([PHP_BINARY,__DIR__.'/d1-server.php',$mode], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    check(is_resource($process), 'Native D1 TCP fixture starts');
    try {
        $wire = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        $options = static fn () => new D1Bridge($wire['url'], $fixture['authority'], $fixture['tablePrefix'], $fixture['secret'], timeout:$mode === 'stall' ? 0.05 : 3);
        if ($mode === 'valid') {
            $adapter = $options();
            check($adapter->capabilities() === ['atomicCommit' => true,'maxCommitSize' => 50], 'Signed handshake exposes exact atomic capability');
            $adapter->setup();
            check(json_encode($adapter) === '{"redacted":true}' && !str_contains(print_r($adapter, true), $fixture['secret']), 'Storage debug/JSON omits secrets');
        } else {
            $error = raises($options, StorageException::class);
            check(!str_contains($error->getMessage(), $fixture['secret']) && !str_contains($error->getMessage(), 'capability=') && $error->getPrevious() === null, 'D1 failures omit secrets/URLs/causes');
            if ($mode === 'stall') {
                check($error->errorCode === 'storage_timeout', 'D1 body deadline covers response body');
            }
        }
        fwrite($pipes[0], "finish\n");
        $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        check($state['valid'] && $state['calls'] === ($mode === 'valid' ? 2 : 1), 'Native raw request signature, fresh nonce, no credential defaults, no redirects/retries');
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }proc_close($process);
    }
}

foreach (['foreign-get','foreign-query','reordered-query','malformed-row','foreign-conflict'] as $mode) {
    $process = proc_open([PHP_BINARY,__DIR__.'/d1-server.php',$mode], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    try {
        $wire = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        $adapter = new D1Bridge($wire['url'], $fixture['authority'], $fixture['tablePrefix'], $fixture['secret']);
        $invoke = match($mode) {
            'foreign-get','malformed-row' => fn () => $adapter->get('sessions', ['kexpected']),
            'foreign-query','reordered-query' => fn () => $adapter->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 'expected','chatId' => 'chat'],'limit' => 10]),
            default => fn () => $adapter->commit([['kind' => 'put','entity' => 'sessions','row' => ['_id' => 'kexpected','_rev' => 1,'_v' => [],'sessionId' => 'expected'],'expectedRev' => null]])
        };
        check(raises($invoke, StorageException::class)->errorCode === 'untrusted_storage_response', 'Signed miswired row/query/conflict response rejected');
        fwrite($pipes[0], "finish\n");
        $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        check($state['valid'] && $state['calls'] === 2, 'Miswired response proof uses actual HTTP');
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }proc_close($process);
    }
}
foreach (['http://public.invalid','https://private@host.invalid','https://host.invalid/path','https://host.invalid?tenant=other'] as $url) {
    raises(fn () => new D1Bridge($url, $fixture['authority'], $fixture['tablePrefix'], $fixture['secret']), StorageException::class);
}
check(Schema::encodeKey('messages', ['sessionId' => 'a.b:é','messageId' => "x/!'()*~"]) === "ka%2Eb%3A%C3%A9:x%2F!'()*~", 'Portable JS key escaping');
echo "Native D1 signed handshake, independent HMAC, wrong-identity/capability/nonce/body rejection, redirects/body deadline and redaction passed.\n";
$endpoint = getenv('POLYMORFA_D1_BRIDGE_FIXTURE_URL');
if ($endpoint !== false && $endpoint !== '') {
    $http = null;
    $host = getenv('POLYMORFA_D1_BRIDGE_FIXTURE_HOST');
    if ($host !== false && $host !== '') {
        $native = GuzzleHttp\HandlerStack::create();
        $http = new GuzzleHttp\Client(['proxy' => '','handler' => static function ($request, $options) use ($host, $native) {
            check($request->getUri()->getHost() === '127.0.0.1', 'Docker fixture transport retains loopback logical authority');
            return $native($request->withUri($request->getUri()->withHost($host), true), $options);
        }]);
    }
    $adapter = new D1Bridge($endpoint, $fixture['authority'], $fixture['tablePrefix'], $fixture['secret'], $http);
    $adapter->setup();
    $session = 'php-native-d1-'.bin2hex(random_bytes(12));
    $portable = json_decode(file_get_contents(__DIR__.'/fixtures/storage-conformance-fixtures.json'), true, flags:JSON_THROW_ON_ERROR);
    $newRow = static function (string $entity, string $scope, array $values): array {
        $definition = Schema::definition($entity);
        $row = array_fill_keys(array_keys($definition['fields']), null);
        $row = array_replace($row, $values);
        $row['sessionId'] = $scope;
        $row['_id'] = Schema::encodeKey($entity, $row);
        $row['_rev'] = 1;
        $row['_v'] = [];
        return $row;
    };
    $writes = [];
    $expected = [];
    foreach ($portable['eventRows'] as $entity => $rows) {
        $expected[$entity] = [];
        foreach ($rows as $source) {
            $row = $newRow($entity, $session, $source);
            $writes[] = ['kind' => 'put','entity' => $entity,'row' => $row,'expectedRev' => null];
            $expected[$entity][$row['_id']] = $row;
        }
    }
    foreach (array_chunk($writes, 50) as $chunk) {
        check($adapter->commit($chunk)['ok'], 'Portable all-entity D1 commit');
    }
    foreach ($expected as $entity => $rows) {
        $got = $adapter->get($entity, array_keys($rows));
        check($got == $rows, 'Portable all-entity D1 rows preserve exact data');
    }
    $bulk = $session.'-bulk';
    $all = [];
    for ($i = 0;$i < 2000;$i++) {
        $row = $newRow('messages', $bulk, ['messageId' => sprintf('m%04d', $i),'chatId' => 'bulk-chat','timestamp' => $i,'text' => 'synthetic']);
        $all[] = ['kind' => 'put','entity' => 'messages','row' => $row,'expectedRev' => null];
    }
    foreach (array_chunk($all, 50) as $chunk) {
        check($adapter->commit($chunk)['ok'], '2000-row native D1 commit');
    }
    $query = ['index' => 'by_chat','equals' => ['sessionId' => $bulk,'chatId' => 'bulk-chat'],'limit' => 700];
    $total = 0;
    for (;;) {
        $rows = $adapter->query('messages', $query);
        if ($rows === []) {
            break;
        }$total += count($rows);
        $last = end($rows);
        $query['after'] = ['sort' => $last['timestamp'],'id' => $last['_id']];
    }check($total === 2000, 'Native 2000-row ordered pagination');
    $missing = $newRow('messages', $bulk, ['messageId' => 'rollback-new','chatId' => 'bulk-chat','timestamp' => 3000]);
    $result = $adapter->commit([$all[0],['kind' => 'put','entity' => 'messages','row' => $missing,'expectedRev' => null]]);
    check(!$result['ok'] && $adapter->get('messages', [$missing['_id']]) === [], 'Atomic conflict leaves all other writes unapplied');
    $lease = $newRow('leases', $bulk, ['owner' => 'native-fixture','expiresAt' => (int)(microtime(true) * 1000) + 3600000]);
    check($adapter->commit([['kind' => 'put','entity' => 'leases','row' => $lease,'expectedRev' => null]])['ok'], 'Create lease row');
    raises(fn () => $adapter->commit([['kind' => 'delete','entity' => 'messages','id' => $all[0]['row']['_id']]]), StorageException::class);
    $lease['_rev'] = 2;
    check($adapter->commit([['kind' => 'put','entity' => 'leases','row' => $lease,'expectedRev' => 1],['kind' => 'delete','entity' => 'messages','id' => $all[0]['row']['_id']]])['ok'], 'Atomic lease-fenced delete');
    $checkpoint = $newRow('checkpoints', $bulk, ['stream' => 'events','cursor' => 'before']);
    check($adapter->commit([['kind' => 'put','entity' => 'checkpoints','row' => $checkpoint,'expectedRev' => null]])['ok'], 'Create checkpoint');
    $checkpoint['_rev'] = 2;
    $checkpoint['cursor'] = 'after';
    $update = ['kind' => 'put','entity' => 'checkpoints','row' => $checkpoint,'expectedRev' => 1];
    check($adapter->commit([$update])['ok'] && !$adapter->commit([$update])['ok'], 'Checkpoint CAS rejects stale replay');
    echo "Actual PHP HTTP -> bundled Worker/Miniflare D1: all-entity fixture,2000 rows/paging,atomic rollback,lease-fenced delete and checkpoint CAS passed.\n";
}
