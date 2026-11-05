<?php

declare(strict_types=1);

require_once dirname(__DIR__).'/vendor/autoload.php';
require_once __DIR__.'/storage_engine_fixture.php';

use Polymorfa\{CancellationToken,HistorySyncCodec,WebhookEvent};
use Polymorfa\Storage\{Batch,Checkpoint,ClearChat,Delete,Engine,EventReducer,FieldWrite,HistoryIdentityIndex,HistoryKeys,HistoryReducer,Patch,Rows,Schema,StorageException,Sync,SyncSource,Upsert,Watermark,WebhookHandler};

function storageCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function storageRaises(callable $run, string $code): void
{
    try {
        $run();
    } catch (StorageException $e) {
        storageCheck($e->errorCode === $code, 'expected '.$code.', got '.$e->errorCode);
        return;
    } throw new RuntimeException('expected '.$code);
}
function storageEvent(array $row): WebhookEvent
{
    return new WebhookEvent($row['id'], $row['session'], $row['timestamp'], $row['event'], $row['payload'], $row, true);
}
function storageExpected(Engine $engine, array $expected): void
{
    foreach ($expected as $entity => $rows) {
        foreach ($rows as $row) {
            $key = [];
            foreach (Schema::definition($entity)['key'] as $name) {
                $key[$name] = $row[$name];
            } $actual = $engine->get($entity, $key);
            storageCheck(Rows::canonical($actual) === Rows::canonical($row), 'portable '.$entity.' '.Rows::canonical($key).' mismatch: '.Rows::canonical($actual));
        }
    }
}

$fixture = json_decode(file_get_contents(__DIR__.'/fixtures/storage-conformance-fixtures.json'), true, flags:JSON_THROW_ON_ERROR);
foreach (['events','history'] as $kind) {
    $adapter = new StorageEngineMemory();
    $engine = new Engine($adapter);
    if ($kind === 'events') {
        foreach ($fixture['events'] as $row) {
            $batch = EventReducer::reduce(storageEvent($row));
            storageCheck($engine->apply($batch)->applied, 'new event applies');
            storageCheck(!$engine->apply($batch)->applied, 'event replay deduplicates');
        } $expected = $fixture['eventRows'];
    } else {
        $batch = HistoryReducer::reduce('portable-fixture', $fixture['history'], chunkId:'chunk');
        storageCheck($engine->apply($batch)->applied, 'history applies');
        storageCheck(!$engine->apply($batch)->applied, 'history replay deduplicates');
        $expected = $fixture['historyRows'];
    }
    storageExpected($engine, $expected);
}

// Multi-group fixture exercises payload batches, merge planning and all indexed conversations.
$large = $fixture['history'];
$template = $large['conversations'][0]['messages'][0];
foreach ($large['conversations'] as $c => &$conversation) {
    $conversation['messages'] = [];
    for ($i = 0;$i < 100;$i++) {
        $m = $template;
        $m['message']['key']['id'] = 'large-'.$c.'-'.$i;
        $m['message']['key']['remoteJid'] = $conversation['id'];
        $conversation['messages'][] = $m;
    }
} unset($conversation);
$adapter = new StorageEngineMemory();
$engine = new Engine($adapter);
$engine->apply(HistoryReducer::reduce('s', $large, chunkId:'large'));
$total = 0;
foreach ($large['conversations'] as $conversation) {
    $total += count($engine->query('messages', ['index' => 'by_chat','equals' => ['sessionId' => 's','chatId' => 'wa:'.$conversation['id']],'limit' => 1000])['rows']);
}
storageCheck($total === 2000, '2,000 history messages remain queryable');
foreach ($adapter->commits as $writes) {
    storageCheck(count($writes) <= 50, 'lease consumes adapter batch slot');
}

// A failed first chunk must never commit a later event marker, even without conflict details.
foreach ([true,false] as $details) {
    $adapter = new StorageEngineMemory(2);
    $adapter->beforeCommit = static function (array $writes) use ($details): ?array {
        foreach ($writes as $w) {
            if ($w['kind'] === 'put' && $w['entity'] === 'messages' && $w['row']['messageId'] === 'bad') {
                return ['ok' => false,'conflicts' => $details ? [$w['row']['_id']] : []];
            }
        } return null;
    };
    $engine = new Engine($adapter, maxRetries:0);
    $ops = [];
    foreach (['bad','good'] as $id) {
        $ops[] = new Upsert('messages', ['sessionId' => 's','messageId' => $id], ['text' => new FieldWrite('body', 0)], new Watermark('s', 'chat', 1));
    }
    $batch = new Batch('s', $ops, 'event');
    storageRaises(fn () => $engine->apply($batch), 'storage_conflict');
    storageCheck(!$engine->hasEvent('s', 'event'), 'failed chunk has no event marker');
    $adapter->beforeCommit = null;
    storageCheck($engine->apply($batch)->applied, 'failed event can retry');
}

$adapter = new StorageEngineMemory();
$engine = new Engine($adapter);
$guard = new Watermark('s', 'chat', 5);
$ops = [];
foreach (['messages','media','reactions','receipts','poll_votes'] as $entity) {
    $key = ['sessionId' => 's','messageId' => 'm'];
    foreach (Schema::definition($entity)['key'] as $keyName) {
        $key[$keyName] ??= 'child';
    } $fields = ['chatId' => new FieldWrite('chat', 0)];
    if ($entity === 'media') {
        $fields['mediaKey'] = new FieldWrite('synthetic', 0);
    } else {
        $fields['timestamp'] = new FieldWrite(5, 0);
    } $ops[] = new Upsert($entity, $key, $fields, $guard);
}
$engine->apply(new Batch('s', $ops));
$engine->apply(new Batch('s', [new Upsert('chats', ['sessionId' => 's','chatId' => 'chat'], ['clearedAt' => new FieldWrite(10, 10)]),new ClearChat('s', 'chat', 10)]));
storageCheck($engine->get('messages', ['sessionId' => 's','messageId' => 'm']) === null && $engine->get('media', ['sessionId' => 's','messageId' => 'm']) === null, 'clear deletes message and media');
foreach (['reactions','receipts','poll_votes'] as $entity) {
    storageCheck($engine->query($entity, ['index' => 'by_message','equals' => ['sessionId' => 's','messageId' => 'm'],'limit' => 100])['rows'] === [], 'clear deletes '.$entity);
}
foreach ([5,10] as $timestamp) {
    $engine->apply(new Batch('s', [new Upsert('messages', ['sessionId' => 's','messageId' => 'm'], ['text' => new FieldWrite('late', 0)], new Watermark('s', 'chat', $timestamp))]));
    storageCheck($engine->get('messages', ['sessionId' => 's','messageId' => 'm']) === null, 'watermark blocks older and equal timestamp');
}

$engine->apply(new Batch('s', [new Checkpoint('s', 'events', 'one', expectedCursor:null)]));
$leaseId = Schema::encodeKey('leases', ['sessionId' => 's']);
$first = $adapter->rows['leases'][$leaseId]['_rev'];
storageRaises(fn () => $engine->apply(new Batch('s', [new Checkpoint('s', 'events', 'two', expectedCursor:null)])), 'storage_checkpoint_conflict');
storageCheck($engine->getCheckpoint('s', 'events')['cursor'] === 'one', 'stale checkpoint stays unchanged');
storageCheck($adapter->rows['leases'][$leaseId]['_rev'] > $first && $adapter->rows['leases'][$leaseId]['owner'] === null, 'durable lease generation not reused');
foreach ([new Upsert('messages', ['sessionId' => 'foreign','messageId' => 'm'], []),new Upsert('leases', ['sessionId' => 's'], []),new Upsert('messages', ['sessionId' => 's','messageId' => 'm'], [], new Watermark('foreign', 'chat', 1))] as $op) {
    storageRaises(fn () => $engine->apply(new Batch('s', [$op])), 'invalid_storage_data');
}
$engine->apply(new Batch('s', [new Patch('messages', ['sessionId' => 's','messageId' => 'missing'], ['text' => new FieldWrite('patch', 1)])]));
storageCheck($engine->get('messages', ['sessionId' => 's','messageId' => 'missing']) === null, 'patch does not create row');

$index = new HistoryIdentityIndex(conversations:['one@s.whatsapp.net' => 'chat-one','two@s.whatsapp.net' => 'chat-two'], messages:[['nativeId' => 'native','id' => 'a','chatId' => 'chat-one','fromMe' => false],['nativeId' => 'native','id' => 'b','chatId' => 'chat-one','fromMe' => true],['nativeId' => 'native','id' => 'c','chatId' => 'chat-two','fromMe' => false]]);
$keys = new HistoryKeys($index);
storageCheck($keys->message(['id' => 'native','fromMe' => false], 'one:4@s.whatsapp.net') === 'a' && $keys->message(['id' => 'native','fromMe' => true], 'one@s.whatsapp.net') === 'b' && $keys->message(['id' => 'native'], 'two@s.whatsapp.net') === 'c', 'native ID separated by chat and direction');
storageCheck($keys->message(['id' => 'missing','participant' => 'sender:3@s.whatsapp.net'], 'group@g.us') === 'wa:group@g.us:0:sender@s.whatsapp.net:missing', 'group fallback retains normalized participant');

foreach ([[1e-6,'0.000001'],[1e-7,'1e-7'],[1e21,'1e+21'],[-0.0,'0'],[1.25,'1.25']] as [$value,$want]) {
    storageCheck(Rows::canonical($value) === $want, 'ECMAScript canonical number '.$want);
}
storageCheck(Rows::compare("\u{10000}", "\u{E000}") < 0, 'UTF16 string order');
$row = Rows::empty('messages', ['sessionId' => 's','messageId' => 'merge']);
$a = ['text' => new FieldWrite('a', 1)];
$b = ['text' => new FieldWrite('b', 1)];
storageCheck(Rows::canonical(Rows::merge('messages', Rows::merge('messages', $row, $a), $b)) === Rows::canonical(Rows::merge('messages', Rows::merge('messages', $row, $b), $a)), 'equal-version merge is commutative');
$row = Rows::merge('messages', $row, ['text' => new FieldWrite(null, Rows::FINAL_VERSION)]);
$row = Rows::merge('messages', $row, ['text' => new FieldWrite('old history', 0)]);
storageCheck($row['text'] === null, 'revocation cannot resurrect older content');
$decoded = HistorySyncCodec::decode(gzcompress("\x08\x02"));
storageRaises(fn () => HistoryReducer::reduce('s', $decoded), 'history_complete_decoder_required');
$full = HistorySyncCodec::decode(gzcompress("\x08\x02"), decoder:static fn (string $raw): array => $fixture['history']);
storageCheck(count(HistoryReducer::reduce('s', $full)->operations) > 1, 'complete decoder hook feeds full reducer');

echo "PHP storage engine: portable event/history entities, replay, 2000 rows, first-failure, child cleanup/watermarks, checkpoint CAS, durable lease, scoped identity and canonical/revocation checks passed.\n";
