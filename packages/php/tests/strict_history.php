<?php

declare(strict_types=1);

use Polymorfa\{CancellationToken,CancelledException,HistorySyncCodec,HistorySyncChunkDescriptor,MediaIntegrityException,Webhooks};
use Polymorfa\Storage\{Engine,Sync,SyncSource};

require_once __DIR__.'/storage_engine_fixture.php';

global $strictHistoryAssertions;
$strictHistoryAssertions = 0;
function strictHistoryCheck(bool $condition, string $name): void
{
    global $strictHistoryAssertions;
    ++$strictHistoryAssertions;
    check($condition, $name);
}
function strictHistoryRefuse(int $path, string $data, string $code = 'media_invalid_ciphertext', int $maximum = HistorySyncCodec::MAX_INFLATED_BYTES): void
{
    $error = raises(static fn () => $path === 0 ? HistorySyncCodec::decode($data, $maximum) : HistorySyncCodec::download($data, maxInflatedBytes:$maximum), MediaIntegrityException::class);
    strictHistoryCheck($error->errorCode === $code, 'Strict history refusal '.$code);
}
$strictHistoryRoot = __DIR__.'/fixtures/strict-history';
$strictCorpus = json_decode(file_get_contents($strictHistoryRoot.'/strict-history.json'), true, flags:JSON_THROW_ON_ERROR);
$strictStream = static fn (string $name): string => base64_decode($strictCorpus['streams'][$name]['input'], true);
$strictPlain = static function (string $name) use ($strictCorpus): string {
    $plain = $strictCorpus['plain'][$name];
    if (isset($plain['base64'])) {
        return base64_decode($plain['base64'], true);
    }
    $n = $size = $plain['zeroFieldBytes'];
    $varint = '';
    while ($n > 127) {
        $varint .= chr(($n & 127) | 128);
        $n >>= 7;
    }
    return "\x08\x03\xa2\x06".$varint.chr($n).str_repeat("\0", $size);
};
$strictDecode = static fn (int $path, string $data, int $maximum = HistorySyncCodec::MAX_INFLATED_BYTES) => $path === 0 ? HistorySyncCodec::decode($data, $maximum) : HistorySyncCodec::download($data, maxInflatedBytes:$maximum);
$strictComplete = $strictRefused = $strictProtobuf = 0;
foreach ($strictCorpus['streams'] as $name => $value) {
    foreach ([0,1] as $path) {
        if (in_array($value['plain'], ['empty','invalid-protobuf'], true)) {
            strictHistoryRefuse($path, $strictStream($name));
            ++$strictProtobuf;
            continue;
        }
        $result = $strictDecode($path, $strictStream($name));
        strictHistoryCheck($result->protobuf === $strictPlain($value['plain']), 'Exact independent plaintext '.$name);
        if ($value['plain'] === 'provider') {
            strictHistoryCheck($result->syncType === 3 && $result->chunkOrder === 7 && $result->progress === 92, 'Provider common fields');
            $full = false;
            foreach ($result->conversations[0]->fields as $field) {
                if ($field->number === 5 && bin2hex($field->value) === 'ffffffffffffffffff01' && $field->integer === null) {
                    $full = true;
                }
            }
            strictHistoryCheck($full && str_contains($result->protobuf, 'unknown provider data'), 'Full unsigned64 and unknown provider bytes');
        }
        ++$strictComplete;
    }
}
foreach ($strictCorpus['invalid'] as $recipe) {
    if (isset($recipe['hex'])) {
        $data = hex2bin($recipe['hex']);
    } else {
        $data = $strictStream($recipe['base']);
        if (isset($recipe['cut'])) {
            $data = substr($data, 0, $recipe['cut']);
        }
        if (isset($recipe['flip'])) {
            $offset = $recipe['flip'] < 0 ? strlen($data) + $recipe['flip'] : $recipe['flip'];
            $data[$offset] = chr(ord($data[$offset]) ^ ($recipe['mask'] ?? 1));
        }
        if (isset($recipe['append'])) {
            $data .= $strictStream($recipe['append']);
        }
        $data .= hex2bin($recipe['tailHex'] ?? '');
    }
    foreach ([0,1] as $path) {
        strictHistoryRefuse($path, $data);
        if (in_array($strictCorpus['streams'][$recipe['base'] ?? '']['plain'] ?? null, ['empty','invalid-protobuf'], true)) {
            ++$strictProtobuf;
        } else {
            ++$strictRefused;
        }
    }
}
strictHistoryCheck([$strictComplete,$strictRefused,$strictProtobuf] === [64,5728,268], 'Exact public corpus classification');
echo "Strict public corpus complete=$strictComplete compressedRefusals=$strictRefused protobufPolicyOnly=$strictProtobuf\n";
$headers = $incomplete = 0;
foreach (json_decode(file_get_contents($strictHistoryRoot.'/strict-history-headers.json'), true, flags:JSON_THROW_ON_ERROR) as $value) {
    $data = '';
    foreach ($value['segments'] as $segment) {
        $data .= isset($segment['base64']) ? base64_decode($segment['base64'], true) : str_repeat(chr($segment['byte']), $segment['count']);
    }
    strictHistoryCheck(hash('sha256', $data) === $value['sha256'], 'Expanded header bytes');
    foreach ([0,1] as $path) {
        if ($value['compression'] === 'valid') {
            strictHistoryCheck($strictDecode($path, $data)->protobuf === base64_decode($value['plain'], true), 'Complete long header');
            ++$headers;
        } else {
            strictHistoryRefuse($path, $data);
            ++$incomplete;
        }
    }
}
$valid = $refused = $policy = 0;
foreach (json_decode(file_get_contents($strictHistoryRoot.'/strict-history-dotnet.json'), true, flags:JSON_THROW_ON_ERROR) as $value) {
    $data = base64_decode($value['input'], true);
    $raw = base64_decode($value['plain'], true);
    foreach ([0,1] as $path) {
        if ($raw !== '') {
            strictHistoryCheck($strictDecode($path, $data, strlen($raw))->protobuf === $raw, 'Stored/flags complete '.$value['name']);
            ++$valid;
        } else {
            strictHistoryRefuse($path, $data);
            ++$policy;
        }
        foreach ([substr($data, 0, -1),$data."\0"] as $bad) {
            strictHistoryRefuse($path, $bad);
            if ($raw === '') {
                ++$policy;
            } else {
                ++$refused;
            }
        }
    }
}
$boundaries = 0;
foreach (json_decode(file_get_contents($strictHistoryRoot.'/go-header-boundaries.json'), true, flags:JSON_THROW_ON_ERROR) as $value) {
    // The fixture's supported field records Go policy. PHP supports these headers.
    foreach ([0,1] as $path) {
        strictHistoryCheck($strictDecode($path, base64_decode($value['input'], true))->protobuf === "\x08\x03", 'Small headers/unused padding');
        ++$boundaries;
    }
}
strictHistoryCheck([$headers,$incomplete,$valid,$refused,$policy,$boundaries] === [30,2,166,332,6,40], 'Exact supplemental classification');
echo "Strict headers complete=30 incomplete=2; supplement valid=166 compressedRefusals=332 protobufPolicyOnly=6; small headers/padding complete=40\n";
foreach (['gzip','zlib','raw'] as $format) {
    $data = $strictStream('provider-'.$format);
    foreach ([0,1] as $path) {
        strictHistoryCheck($strictDecode($path, $data, strlen($strictPlain('provider')))->syncType === 3, 'Exact inflated cap');
        strictHistoryRefuse($path, $data, 'media_too_large', strlen($strictPlain('provider')) - 1);
        $cancel = new CancellationToken();
        $cancel->cancel();
        raises(static fn () => $path === 0 ? HistorySyncCodec::decode($data, cancellation:$cancel) : HistorySyncCodec::download($data, cancellation:$cancel), CancelledException::class);
        strictHistoryCheck(true, 'Pre-abort direct/inline');
    }
    strictHistoryCheck(HistorySyncCodec::download($data, maxBytes:strlen($data))->syncType === 3, 'Exact compressed cap');
    $error = raises(static fn () => HistorySyncCodec::download($data, maxBytes:strlen($data) - 1), MediaIntegrityException::class);
    strictHistoryCheck($error->errorCode === 'media_too_large', 'One-under compressed cap');
}
foreach (['gzip','zlib'] as $format) {
    $data = $strictStream('large-'.$format);
    $data[strlen($data) - 1] = chr(ord($data[strlen($data) - 1]) ^ 1);
    foreach ([0,1] as $path) {
        strictHistoryRefuse($path, $data, 'media_too_large', 8192);
    }
}
// Actual independent Node encryption, HTTPS, public Guzzle injection, confined credentials.
$process = proc_open(['node',$strictHistoryRoot.'/strict-history-server.mjs'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
strictHistoryCheck(is_resource($process), 'Independent TLS peer starts');
try {
    $ready = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
    $http = new GuzzleHttp\Client(['verify' => $ready['directory'].'/authority.pem','proxy' => '', 'curl' => [CURLOPT_CONNECT_TO => ['mmg.whatsapp.net:443:127.0.0.1:'.$ready['port']]], 'headers' => ['Authorization' => 'must-not-replay','Cookie' => 'must-not-replay','Polymorfa-Version' => 'must-not-replay']]);
    $descriptor = static function (string $name) use ($ready): HistorySyncChunkDescriptor {
        $d = $ready['descriptors'][$name];
        return new HistorySyncChunkDescriptor($d['directPath'], hex2bin($d['mediaKey']), hex2bin($d['fileSha256']), hex2bin($d['fileEncSha256']), $d['fileLength']);
    };
    $calls = 0;
    $custom = static function (string $raw) use (&$calls): string {
        ++$calls;
        return 'verified';
    };
    foreach (['gzip','zlib','raw','tail','concat','checksum','tampered','large'] as $name) {
        $d = $descriptor($name === 'tampered' ? 'gzip' : $name);
        if ($name === 'tampered') {
            $d = new HistorySyncChunkDescriptor('/tampered.enc', $d->mediaKey, $d->fileSha256, $d->fileEncSha256, $d->fileLength);
        }
        $before = $calls;
        if (in_array($name, ['gzip','zlib','raw'], true)) {
            strictHistoryCheck(HistorySyncCodec::download($d, http:$http, decoder:$custom)->syncType === 3 && $calls === $before + 1, 'Authenticated valid '.$name);
        } else {
            $error = raises(static fn () => HistorySyncCodec::download($d, maxInflatedBytes:$name === 'large' ? 8192 : HistorySyncCodec::MAX_INFLATED_BYTES, http:$http, decoder:$custom), MediaIntegrityException::class);
            strictHistoryCheck($error->errorCode === ($name === 'tampered' ? 'media_enc_hash_mismatch' : ($name === 'large' ? 'media_too_large' : 'media_invalid_ciphertext')) && $calls === $before, 'Authenticated failure before custom decoder '.$name);
        }
    }
    $cancelStarted = microtime(true);
    raises(static fn () => HistorySyncCodec::download($descriptor('gate'), cancellation:CancellationToken::after(0.1), http:$http), CancelledException::class);
    echo 'Strict stalled cancellation elapsedSeconds='.round(microtime(true) - $cancelStarted, 3)."\n";
    strictHistoryCheck(true, 'Stalled native cancellation');
    $state = json_decode($http->get('https://mmg.whatsapp.net/state', ['headers' => []])->getBody()->getContents(), true, flags:JSON_THROW_ON_ERROR);
    strictHistoryCheck(count($state['requests']) === 9, 'Exact native request count');
    foreach ($state['requests'] as $request) {
        strictHistoryCheck(!$request['authorization'] && !$request['cookie'] && !$request['version'] && $request['mms'] === 'md-msg-hist' && $request['origin'] === 'https://web.whatsapp.com' && $request['referer'] === 'https://web.whatsapp.com/', 'CDN credential confinement');
    }
    echo "Strict authenticated download: 3 valid, 3 compressed refusals, tamper, quota, stalled cancellation; 9 confined requests\n";
} finally {
    proc_terminate($process);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }
    proc_close($process);
}
foreach ([false,true] as $bad) {
    $data = $strictStream('provider-gzip').($bad ? "\0" : '');
    $raw = json_encode(['id' => 'signed-archive','session' => 'fixture-session','timestamp' => '2026-10-17T00:00:00Z','event' => 'history.sync','payload' => ['mode' => 'deliver','messages' => [],'syncType' => 'RECENT','chunkOrder' => 7,'progress' => 92,'fileLength' => strlen($data),'conversationCount' => 1,'messageCount' => 0,'pushNameCount' => 0,'statusMessageCount' => 0,'whatsapp_ids' => ['linked_devices' => 'fixture-archive'],'whatsapp' => ['encoding' => 'gzip-base64-protobuf','data' => base64_encode($data)]]], JSON_THROW_ON_ERROR);
    $event = Webhooks::constructEvent($raw, hash_hmac('sha256', $raw, 'synthetic-archive-secret'), 'synthetic-archive-secret');
    $adapter = new StorageEngineMemory();
    $engine = new Engine($adapter);
    $source = new class ($event) implements SyncSource {
        public int $acks = 0;
        public function __construct(private readonly Polymorfa\WebhookEvent $event)
        {
        }
        public function open(?string $cursor, CancellationToken $cancellation): iterable
        {
            strictHistoryCheck($cursor === null, 'Archive starts without checkpoint');
            yield ['webhook' => $this->event,'cursor' => 'after-archive','streamId' => 'fixture-stream','sequence' => 1];
        }
        public function acknowledge(string $streamId, string $cursor, int $sequence, CancellationToken $cancellation): void
        {
            ++$this->acks;
        }
        public function close(): void
        {
        }
    };
    $sync = new Sync($source, $engine, decodeHistory:static function (Polymorfa\WebhookEvent $event): array {
        $decoded = HistorySyncCodec::download(base64_decode($event->payload['whatsapp']['data'], true));
        // Test application projection. Generic descriptor dispatch remains separate.
        return ['conversations' => array_map(static fn ($c) => ['id' => $c->id], $decoded->conversations),'chunkOrder' => $decoded->chunkOrder,'progress' => $decoded->progress];
    });
    if ($bad) {
        $error = raises(static fn () => $sync->pump(), MediaIntegrityException::class);
        strictHistoryCheck($error->errorCode === 'media_invalid_ciphertext' && !$engine->hasEvent($event->session, $event->id) && $engine->getCheckpoint('*', 'events') === null && $source->acks === 0 && $adapter->rows === [] && $adapter->commits === [], 'Invalid archive cannot apply rows/progress/markers/checkpoint/ACK');
    } else {
        $sync->pump();
        strictHistoryCheck($engine->hasEvent($event->session, $event->id) && $engine->getCheckpoint('*', 'events')['cursor'] === 'after-archive' && $source->acks === 1 && count($adapter->rows['chats']) === 1, 'Valid projected archive applies and ACKs');
    }
}
echo "Strict signed archive: invalid compression leaves all state absent; valid projected control applies/ACKs\n";
check($strictHistoryAssertions === 6782, 'Strict assertion counter binds correctly in standalone and canonical inclusion scopes');
echo "Strict history counted assertions=$strictHistoryAssertions\n";
