<?php

declare(strict_types=1);
require_once dirname(__DIR__).'/vendor/autoload.php';
require_once __DIR__.'/storage_engine_fixture.php';
use Polymorfa\{Webhooks,WebhookEvent};
use Polymorfa\Storage\{Engine,WebhookHandler};

function descriptorCheck(bool $ok, string $message): void
{
    if (!$ok) {
        throw new RuntimeException($message);
    }
}
function descriptorEvent(array $payload, bool $signed = true): WebhookEvent
{
    $event = ['id' => 'descriptor-event','session' => 'descriptor-session','timestamp' => '2026-10-17T00:00:00Z','event' => 'history.sync','payload' => $payload];
    $raw = json_encode($event, JSON_THROW_ON_ERROR);
    return $signed ? Webhooks::constructEvent($raw, hash_hmac('sha256', $raw, 'synthetic-secret'), 'synthetic-secret') : new WebhookEvent($event['id'], $event['session'], $event['timestamp'], $event['event'], $payload, $event, true);
}
$descriptorFixture = json_decode(file_get_contents(__DIR__.'/fixtures/descriptor-storage/fixture.json'), true, flags:JSON_THROW_ON_ERROR);
$descriptorAdapter = new StorageEngineMemory();
$descriptorStorage = new Engine($descriptorAdapter);
$refused = false;
try {
    (new WebhookHandler($descriptorStorage))(descriptorEvent($descriptorFixture['inline']));
} catch (Throwable) {
    $refused = true;
}
descriptorCheck($refused, 'undecoded descriptor was consumed');
descriptorCheck(!$descriptorStorage->hasEvent('descriptor-session', 'descriptor-event'), 'failed descriptor marked');

use Polymorfa\{HistorySyncCodec,ProjectClient,Credential,CancellationToken};
use Polymorfa\Storage\{HistoryDescriptorMode,StorageException,ApiEventSource,Sync,SyncSource,Batch,Checkpoint};

$descriptorOutcomes = 1;
foreach (['inline','media'] as $branch) {
    foreach (['missing','archive','null','error','invalid','metadata','metadata-decoder','empty','full'] as $mode) {
        $a = new StorageEngineMemory();
        $s = new Engine($a);
        $e = descriptorEvent($descriptorFixture[$branch]);
        $calls = 0;
        $archive = $mode === 'archive' ? static function (WebhookEvent $event) use (&$calls): null {
            $calls++;
            return null;
        } : null;
        $decoder = static function (array $p, WebhookEvent $original) use (&$calls, $mode, $branch, $descriptorFixture): mixed {
            $calls++;
            descriptorCheck($p === $original->payload, 'descriptor args');
            if ($mode === 'null') {
                return null;
            }if ($mode === 'error') {
                throw new RuntimeException($descriptorFixture['media']['media']['mediaKey']);
            }if ($mode === 'invalid') {
                return ['conversations' => 'bad'];
            }if ($mode === 'empty') {
                return [];
            }if ($branch === 'inline') {
                return HistorySyncCodec::decode(base64_decode($p['inline']['data'], true), decoder:static fn (string $bytes): array => $descriptorFixture['chunk']);
            }return $descriptorFixture['chunk'];
        };
        $opts = ['decodeHistory' => $archive,'decodeHistoryDescriptor' => in_array($mode, ['missing','archive','metadata'], true) ? null : $decoder,'historyDescriptorMode' => str_starts_with($mode, 'metadata') ? HistoryDescriptorMode::MetadataOnly : HistoryDescriptorMode::Decode];
        $failed = in_array($mode, ['missing','archive','null','error','invalid'], true);
        $error = null;
        try {
            (new WebhookHandler($s, ...$opts))($e);
        } catch (Throwable $x) {
            $error = $x;
        }
        descriptorCheck(($error !== null) === $failed, 'dispatch outcome '.$mode);
        descriptorCheck($s->hasEvent($e->session, $e->id) === !$failed, 'marker');
        descriptorCheck(count($a->rows['messages'] ?? []) === ($mode === 'full' ? 1 : 0), 'content');
        descriptorCheck((count($a->rows['history_progress'] ?? []) > 0) === !$failed, 'progress');
        if ($failed) {
            descriptorCheck($a->rows === [], 'failed rows');
        }
        $stored = json_encode($a->rows, JSON_THROW_ON_ERROR);
        foreach ([$descriptorFixture['inline']['inline']['data'],$descriptorFixture['media']['media']['mediaKey']] as $secret) {
            descriptorCheck(!str_contains($stored, $secret) && !str_contains($error?->getMessage() ?? '', $secret), 'secret safety');
        }
        if ($mode === 'full') {
            descriptorCheck(str_contains($stored, 'wa:') && !str_contains(json_encode($a->rows['messages'], JSON_THROW_ON_ERROR), 'synthetic-notification'), 'native identities');
        }
        if ($mode === 'archive' || str_starts_with($mode, 'metadata')) {
            descriptorCheck($calls === 0, 'wrong callback invoked');
        }if (!$failed) {
            descriptorCheck(!(new WebhookHandler($s))($e)->applied, 'duplicate needs decoder');
        }$descriptorOutcomes++;
    }
}
foreach ([['delivery' => null],['delivery' => 'bad'],['media' => []],['inline' => null],['whatsapp_ids' => []],['whatsapp_ids' => ['linked_devices' => null]],['fileLength' => null],['fileLength' => -1],['fileLength' => 1.5],['progress' => 101],['progress' => true],['syncType' => ''],['oldestMessageAt' => '2026-02-30T00:00:00Z'],['peerDataRequestSessionId' => null],['whatsapp_id' => '']] as $patch) {
    $a = new StorageEngineMemory();
    $s = new Engine($a);
    $failed = false;
    try {
        (new WebhookHandler($s, historyDescriptorMode:HistoryDescriptorMode::MetadataOnly))(descriptorEvent(array_replace($descriptorFixture['inline'], $patch), false));
    } catch (Throwable) {
        $failed = true;
    }descriptorCheck($failed && $a->rows === [], 'malformed raw consumed');
    $descriptorOutcomes++;
}
$archivePayload = $descriptorFixture['inline'];
unset($archivePayload['delivery'],$archivePayload['inline']);
$archivePayload['messages'] = [];
foreach (['missing','null','full','error','cloud'] as $mode) {
    $a = new StorageEngineMemory();
    $s = new Engine($a);
    $calls = 0;
    $decode = static function (WebhookEvent $e) use ($archivePayload, $mode, $descriptorFixture, &$calls): ?array {
        $calls++;
        descriptorCheck($e->payload === $archivePayload, 'archive callback args');
        if ($mode === 'error') {
            throw new RuntimeException('archive callback failure');
        }return $mode === 'full' ? $descriptorFixture['chunk'] : null;
    };
    $error = null;
    try {
        (new WebhookHandler($s, decodeHistory:$mode === 'missing' ? null : $decode))(descriptorEvent($mode === 'cloud' ? ['kind' => 'history','value' => []] : $archivePayload));
    } catch (Throwable $x) {
        $error = $x;
    }descriptorCheck(($error !== null) === ($mode === 'error'), 'archive/cloud behavior');
    if (in_array($mode, ['missing','cloud'], true)) {
        descriptorCheck($calls === 0, 'cloud/archive dispatch');
    }$descriptorOutcomes++;
}
$peer = proc_open(['node',__DIR__.'/fixtures/descriptor-storage/server.mjs'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
descriptorCheck(is_resource($peer), 'fixture server');
try {
    $ready = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
    $fixtureHttp = new GuzzleHttp\Client(['base_uri' => $ready['baseUrl'],'http_errors' => false]);
    foreach (['inline','media'] as $branch) {
        foreach (['missing','archive','null','error','invalid','metadata','metadata-decoder','empty','full','conflict','ack-error','malformed'] as $mode) {
            $payload = $descriptorFixture[$branch];
            if ($mode === 'malformed') {
                $payload['delivery'] = null;
            }$fixtureHttp->post('/configure', ['json' => ['branch' => $branch,'mode' => $mode,'payload' => $payload]]);
            $a = new StorageEngineMemory();
            $s = new Engine($a);
            $decoder = static function (array $p, WebhookEvent $event) use ($mode, $s, $descriptorFixture): mixed {
                if ($mode === 'null') {
                    return null;
                }if ($mode === 'error') {
                    throw new RuntimeException('synthetic callback failure');
                }if ($mode === 'invalid') {
                    return ['conversations' => 'bad'];
                }if ($mode === 'empty') {
                    return [];
                }if ($mode === 'conflict') {
                    $s->apply(new Batch('*', [new Checkpoint('*', 'events', 'competitor', expectedCursor:null)]));
                }return $descriptorFixture['chunk'];
            };
            $api = new ProjectClient(Credential::organizationApiKey('pmfa_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'), '018f0000-0000-7000-8000-000000000077', baseUrl:$ready['baseUrl'], maxNetworkRetries:0);
            $source = new class (new ApiEventSource($api->events), $s) implements SyncSource {
                public function __construct(private ApiEventSource $api, private Engine $storage)
                {
                }public function open(?string $cursor, CancellationToken $c): iterable
                {
                    return $this->api->open($cursor, $c);
                }public function acknowledge(string $id, string $cursor, int $sequence, CancellationToken $c): void
                {
                    descriptorCheck($this->storage->hasEvent('descriptor-session', 'descriptor-event'), 'ACK before marker');
                    descriptorCheck($this->storage->getCheckpoint('*', 'events')['cursor'] === 'descriptor-cursor', 'ACK before checkpoint');
                    $this->api->acknowledge($id, $cursor, $sequence, $c);
                }public function close(): void
                {
                    $this->api->close();
                }
            };
            $sync = null;
            $sync = new Sync($source, $s, decodeHistory:$mode === 'archive' ? static fn (WebhookEvent $e): never => throw new RuntimeException('archive must skip') : null, decodeHistoryDescriptor:in_array($mode, ['missing','archive','metadata','malformed'], true) ? null : $decoder, historyDescriptorMode:str_starts_with($mode, 'metadata') ? HistoryDescriptorMode::MetadataOnly : HistoryDescriptorMode::Decode, onApplied:static function () use (&$sync): void {
                $sync->close();
            });
            $error = null;
            try {
                $sync->pump();
            } catch (Throwable $x) {
                $error = $x;
            }
            $state = json_decode((string)$fixtureHttp->get('/state')->getBody(), true, flags:JSON_THROW_ON_ERROR);
            $failed = in_array($mode, ['missing','archive','null','error','invalid','malformed'], true);
            descriptorCheck($state['manual'] && $state['media'] === 0, 'manual stream/no download');
            descriptorCheck($state['acks'] === ($failed || $mode === 'conflict' ? 0 : 1), 'HTTP ACK count');
            descriptorCheck($s->hasEvent('descriptor-session', 'descriptor-event') === !$failed, 'HTTP marker');
            descriptorCheck(count($a->rows['messages'] ?? []) === (in_array($mode, ['full','conflict','ack-error'], true) ? 1 : 0), 'HTTP content');
            descriptorCheck(($s->getCheckpoint('*', 'events')['cursor'] ?? null) === ($failed ? null : ($mode === 'conflict' ? 'competitor' : 'descriptor-cursor')), 'HTTP cursor');
            if (in_array($mode, ['metadata','full'], true)) {
                $again = null;
                $again = new Sync(new ApiEventSource($api->events), $s, onApplied:static function () use (&$again): void {
                    $again->close();
                });
                $again->pump();
                $state = json_decode((string)$fixtureHttp->get('/state')->getBody(), true, flags:JSON_THROW_ON_ERROR);
                descriptorCheck($state['lastEventId'] === 'descriptor-cursor' && $state['acks'] === 2, 'HTTP duplicate resume');
            }$descriptorOutcomes++;
        }
    }
} finally {
    proc_terminate($peer);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }proc_close($peer);
}
echo "PHP descriptor storage: ".$descriptorOutcomes." public outcomes including signed webhook, raw validation and actual HTTP/SSE/manual ACK.\n";

// Producer schema controls exercise both the signed parser and raw stream seam.
$schemaCases = [];
foreach (['whatsapp_ids','original_whatsapp_ids','whatsapp_id','original_whatsapp_id'] as $key) {
    foreach ([256,257] as $length) {
        $value = str_repeat("\u{1F431}", $length);
        $schemaCases[] = [$key.'-'.$length,array_replace($descriptorFixture['inline'], [$key => str_ends_with($key, '_ids') ? ['linked_devices' => $value] : $value]),$length === 256];
    }
}
foreach (['0000-02-29T00:00Z' => true,'2026-10-17T00:00Z' => true,'2026-10-17T00:00:00+00:00' => false,'2025-02-29T00:00Z' => false,'2026-10-17T00:00:00.123Z' => true] as $date => $valid) {
    $schemaCases[] = ['date-'.$date,array_replace($descriptorFixture['inline'], ['oldestMessageAt' => $date]),$valid];
}
foreach (['top','inline','media'] as $branch) {
    $p = $descriptorFixture[$branch === 'media' ? 'media' : 'inline'];
    if ($branch === 'top') {
        $p['unprojected'] = true;
    } else {
        $p[$branch]['unprojected'] = true;
    }
    $schemaCases[] = ['unprojected-'.$branch,$p,false];
}
foreach ([['whatsapp_ids' => (object)[]],['original_whatsapp_ids' => (object)[]],['whatsapp_id' => ''],['original_whatsapp_id' => ''],['syncType' => ''],['fileLength' => 1.5],['progress' => null],['peerDataRequestSessionId' => null]] as $index => $patch) {
    $schemaCases[] = ['optional-'.$index,array_replace($descriptorFixture['inline'], $patch),false];
}
$schemaCases[] = ['whole-floats',array_replace($descriptorFixture['inline'], ['fileLength' => 1.0,'chunkOrder' => 7.0,'progress' => 92.0]),true];
$schemaFailures = [];
foreach ($schemaCases as [$label,$payload,$valid]) {
    $parserPassed = true;
    try {
        descriptorEvent($payload);
    } catch (Throwable) {
        $parserPassed = false;
    }
    $a = new StorageEngineMemory();
    $s = new Engine($a);
    $storagePassed = true;
    try {
        (new WebhookHandler($s, historyDescriptorMode:HistoryDescriptorMode::MetadataOnly))(descriptorEvent($payload, false));
    } catch (Throwable) {
        $storagePassed = false;
    }
    if ($parserPassed !== $valid || $storagePassed !== $valid || (!$valid && $a->rows !== [])) {
        $schemaFailures[] = ['case' => $label,'expected' => $valid,'parser' => $parserPassed,'storage' => $storagePassed];
    }
}
echo 'PHP producer schema controls: '.count($schemaCases).' outcomes, mismatches '.json_encode($schemaFailures, JSON_THROW_ON_ERROR)."\n";
descriptorCheck($schemaFailures === [], 'descriptor schema disagrees with producer');
$archivePayload['futureField'] = ['safe' => true];
descriptorCheck(descriptorEvent($archivePayload)->payload === $archivePayload, 'archive extension changed');
$unknown = ['id' => 'future-event','session' => 'descriptor-session','timestamp' => '2026-10-17T00:00:00Z','event' => 'future.event','payload' => ['delivery' => 'future','futureField' => true]];
$raw = json_encode($unknown, JSON_THROW_ON_ERROR);
descriptorCheck(Webhooks::constructEvent($raw, hash_hmac('sha256', $raw, 'synthetic-secret'), 'synthetic-secret')->payload === $unknown['payload'], 'unknown event changed');
