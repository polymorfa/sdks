<?php

declare(strict_types=1);

require_once __DIR__.'/storage_engine.php';

use Polymorfa\{CancellationToken,CancelledException,WebhookEvent};
use Polymorfa\Storage\{Batch,Checkpoint,Engine,EventReducer,FieldWrite,Schema,StorageException,Sync,SyncSource,Upsert,WebhookHandler};

final class StorageEngineSource implements SyncSource
{
    public ?string $openedCursor = null;
    public array $acks = [];
    public bool $closed = false;
    public function __construct(private readonly Engine $storage, private readonly WebhookEvent $event, private readonly string $mode = 'valid')
    {
    }
    public function open(?string $cursor, CancellationToken $cancellation): iterable
    {
        $this->openedCursor = $cursor;
        if ($this->mode === 'gap') {
            throw new StorageException('storage_stream_gap');
        }
        yield ['webhook' => $this->mode === 'missing' ? null : $this->event,'cursor' => 'new','streamId' => 'stream','sequence' => 3];
    }
    public function acknowledge(string $streamId, string $cursor, int $sequence, CancellationToken $cancellation): void
    {
        storageCheck($this->storage->hasEvent($this->event->session, $this->event->id), 'data marker exists before ACK');
        storageCheck($this->storage->getCheckpoint('*', 'events')['cursor'] === 'new', 'checkpoint committed before ACK');
        $this->acks[] = [$streamId,$cursor,$sequence];
    }
    public function close(): void
    {
        $this->closed = true;
    }
}

$event = storageEvent($fixture['events'][0]);
foreach (['valid','gap','missing','conflict'] as $mode) {
    $adapter = new StorageEngineMemory();
    $engine = new Engine($adapter, maxRetries:0);
    $engine->apply(new Batch('*', [new Checkpoint('*', 'events', 'old', expectedCursor:null)]));
    if ($mode === 'conflict') {
        $adapter->beforeCommit = static function (array $writes): ?array {
            foreach ($writes as $write) {
                if ($write['kind'] === 'put' && $write['entity'] === 'checkpoints' && $write['row']['cursor'] === 'new') {
                    return ['ok' => false,'conflicts' => [$write['row']['_id']]];
                }
            } return null;
        };
    }
    $source = new StorageEngineSource($engine, $event, $mode);
    $sync = new Sync($source, $engine);
    if ($mode === 'valid') {
        $sync->pump();
        storageCheck($source->acks === [['stream','new',3]], 'ACK exact stream/cursor/sequence');
    } else {
        storageRaises(fn () => $sync->pump(), match($mode) {
            'gap' => 'storage_stream_gap','missing' => 'storage_payload_unavailable',default => 'storage_conflict'
        });
        storageCheck($source->acks === [], 'failed storage sync has no ACK');
        storageCheck($engine->getCheckpoint('*', 'events')['cursor'] === 'old', 'failed sync never advances cursor');
    }
    storageCheck($source->openedCursor === 'old' && $source->closed && $sync->isClosed(), 'resume saved cursor and close source');
}
$adapter = new StorageEngineMemory();
$engine = new Engine($adapter);
$source = new StorageEngineSource($engine, $event);
$sync = new Sync($source, $engine);
$sync->close();
$sync->pump();
storageCheck($source->openedCursor === null && $source->acks === [], 'close before pump never opens stream');

// A replaced lease invalidates writes even if the old writer still has an in-memory holder.
$adapter = new StorageEngineMemory();
$engine = new Engine($adapter);
$replaced = false;
$adapter->beforeCommit = static function (array $writes, StorageEngineMemory $adapter) use (&$replaced): ?array {
    foreach ($writes as $write) {
        if (!$replaced && $write['entity'] === 'messages') {
            $leaseId = Schema::encodeKey('leases', ['sessionId' => 's']);
            $adapter->rows['leases'][$leaseId]['_rev']++;
            $adapter->rows['leases'][$leaseId]['owner'] = 'replacement';
            $replaced = true;
        }
    } return null;
};
storageRaises(fn () => $engine->apply(new Batch('s', [new Upsert('messages', ['sessionId' => 's','messageId' => 'm'], ['text' => new FieldWrite('body', 0)])], 'event')), 'storage_lease_lost');
storageCheck($engine->get('messages', ['sessionId' => 's','messageId' => 'm']) === null && !$engine->hasEvent('s', 'event'), 'old holder has no message/marker effects');
storageCheck($adapter->rows['leases'][Schema::encodeKey('leases', ['sessionId' => 's'])]['owner'] === 'replacement', 'old finally release cannot clear replacement lease');

$clock = 100;
$adapter = new StorageEngineMemory();
$engine = new Engine($adapter, leaseDurationMs:10, now:static function () use (&$clock): int {
    return $clock;
});
$advanced = false;
$adapter->beforeCommit = static function (array $writes) use (&$advanced, &$clock): ?array {
    if (!$advanced && $writes[0]['entity'] === 'leases') {
        $advanced = true;
        $clock = 1000;
    } return null;
};
storageRaises(fn () => $engine->apply(new Batch('s', [new Upsert('messages', ['sessionId' => 's','messageId' => 'm'], ['text' => new FieldWrite('expired', 0)])])), 'storage_lease_lost');
storageCheck($engine->get('messages', ['sessionId' => 's','messageId' => 'm']) === null, 'expired lease fails before payload effects');

$token = new CancellationToken();
$token->cancel();
$adapter = new StorageEngineMemory();
$engine = new Engine($adapter);
try {
    $engine->apply(new Batch('s', []), $token);
    throw new RuntimeException('cancel expected');
} catch (CancelledException) {
} storageCheck($adapter->rows === [], 'cancel before apply has no lease effects');

$adapter = new StorageEngineMemory();
$engine = new Engine($adapter);
$called = 0;
$historyEvent = new WebhookEvent('history-event', 's', '2026-10-01T12:00:00Z', 'history.sync', ['syncType' => 'FULL','chunkOrder' => 0], [], true);
$handler = new WebhookHandler($engine, static function (WebhookEvent $event) use (&$called, $fixture): array {
    $called++;
    return $fixture['history'];
});
storageCheck($handler($historyEvent)->applied && !$handler($historyEvent)->applied && $called === 1, 'history replay never downloads/decodes twice');

echo "PHP storage sync: event commit then checkpoint CAS then manual ACK; gap/missing/conflict fail closed; saved cursor, close, cancellation, replaced/expired lease and history replay checks passed.\n";

foreach (['%%%', base64_encode('{}')] as $invalidPayload) {
    $engine = new Engine(new StorageEngineMemory());
    $envelope = $fixture['events'][0];
    $good = ['type' => 'event', 'cursor' => 'good', 'streamId' => 'stream', 'sequence' => 1, 'event' => ['payload' => ['encoding' => 'base64', 'contentType' => 'application/json', 'data' => base64_encode(json_encode($envelope, JSON_THROW_ON_ERROR))]]];
    $bad = $good;
    $bad['cursor'] = 'bad';
    $bad['sequence'] = 2;
    $bad['event']['payload']['data'] = $invalidPayload;
    $history = [];
    $http = mocked([
        new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], 'data: '.json_encode($good)."\n\ndata: ".json_encode($bad)."\n\n"),
        new GuzzleHttp\Psr7\Response(200, ['content-type' => 'application/json'], '{"data":{"streamId":"stream","acknowledgedCursor":"good","sequence":1,"replayed":false}}'),
        new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], "data: {\"type\":\"revoked\"}\n\n"),
    ], $history);
    $requestCount = 0;
    $http->getConfig('handler')->push(GuzzleHttp\Middleware::mapRequest(function ($request) use ($engine, $envelope, &$requestCount) {
        ++$requestCount;
        if ($request->getMethod() === 'POST') {
            storageCheck($engine->hasEvent($envelope['session'], $envelope['id']) && $engine->getCheckpoint('*', 'events')['cursor'] === 'good', 'Payload committed and checkpoint saved before native ACK');
            storageCheck(json_decode((string)$request->getBody(), true) === ['cursor' => 'good', 'sequence' => 1], 'Only valid event is acknowledged');
        } elseif ($requestCount > 1) {
            storageCheck($request->getHeaderLine('Last-Event-ID') === 'good' && $engine->getCheckpoint('*', 'events')['cursor'] === 'good', 'Bad cursor never reaches storage or reconnect header');
        }
        return $request;
    }));
    $client = new Polymorfa\Client(Polymorfa\Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'), http:$http);
    $sync = new Sync(new Polymorfa\Storage\ApiEventSource($client->project('project')->events), $engine);
    raises(fn () => $sync->pump(), Polymorfa\AuthorizationException::class);
    storageCheck(count($history) === 3 && $engine->getCheckpoint('*', 'events')['cursor'] === 'good', 'Malformed base64/envelope cannot advance durable cursor');
}
