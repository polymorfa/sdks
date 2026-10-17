<?php

declare(strict_types=1);

use Polymorfa\{CancellationToken,CancelledException,ConfigurationException,HistorySyncCodec,HistorySyncChunkDescriptor,HistorySyncData,MediaIntegrityException,RequestOptions,ServerException};

$historyFixture = json_decode(file_get_contents(__DIR__.'/fixtures/history-local.json'), true, flags:JSON_THROW_ON_ERROR);
$historyBytes = static fn (string $name): string => base64_decode($historyFixture[$name], true);
foreach (['zlib','gzip','rawDeflate'] as $format) {
    $calls = 0;
    $decoded = HistorySyncCodec::download($historyBytes($format), decoder:static function (string $raw) use (&$calls, $historyBytes): string {
        ++$calls;
        check($raw === $historyBytes('protobuf'), 'Decoder sees exact verified protobuf');
        return 'custom-model';
    });
    check($decoded->protobuf === $historyBytes('protobuf') && $decoded->syncType === 3 && $decoded->chunkOrder === 2 && $decoded->progress === 100 && $decoded->decoded === 'custom-model' && $calls === 1, 'Three compression formats preserve core history');
    $conversation = $decoded->conversations[0];
    $message = $conversation->messages[0];
    check($conversation->id === 'user@lid' && $message->messageProtobuf === $historyBytes('messageProtobuf') && bin2hex($message->messageOrderVarint) === 'ffffffffffffffffff01', 'Nested message and unsigned64 retained without floats');
    $rebuilt = implode('', array_map(static fn ($field) => $field->raw, $decoded->fields));
    check($rebuilt === $historyBytes('protobuf') && str_ends_with($rebuilt, $historyBytes('unknownFields')), 'Every unknown field/group remains byte exact');
    check(json_encode($decoded) === '{"redacted":true}' && !str_contains(print_r($decoded, true), 'private history'), 'History and nested data redact formatting');
}
$valid = $historyBytes('zlib');
foreach (['','invalid',substr($valid, 0, -1),$valid."\0",$valid.$valid,gzcompress("\x08"),gzcompress("\x08\x03\x12\x01\xff"),gzcompress("\x08\x03\x2c"),gzcompress("\x08\x03\x2b"),gzcompress("\x08\x03\x12\0"),gzcompress("\x08\x03\x12\x03\x0a\x01\xff")] as $invalid) {
    $calls = 0;
    raises(static function () use ($invalid, &$calls): void {
        HistorySyncCodec::decode($invalid, decoder:static function (string $raw) use (&$calls): void {
            ++$calls;
        });
    }, MediaIntegrityException::class);
    check($calls === 0, 'Invalid compression/protobuf never reaches decoder');
}
check(raises(fn () => HistorySyncCodec::decode($valid, maxInflatedBytes:8), MediaIntegrityException::class)->errorCode === 'media_too_large', 'Inflated size bound');
check(raises(fn () => HistorySyncCodec::download($valid, maxBytes:8), MediaIntegrityException::class)->errorCode === 'media_too_large', 'Compressed size bound');
$cancelled = new CancellationToken();
$cancelled->cancel();
raises(fn () => HistorySyncCodec::decode($valid, cancellation:$cancelled), CancelledException::class);
$error = raises(fn () => HistorySyncCodec::decode($valid, decoder:static fn (string $raw) => throw new RuntimeException('private history secret')), MediaIntegrityException::class);
check(!str_contains($error->getMessage(), 'private') && $error->getPrevious() === null, 'Decoder errors omit content and causes');
foreach (['valid','corrupt','cancelled','api','api-error'] as $mode) {
    $serverMode = str_starts_with($mode, 'api') ? 'history-'.$mode : 'history';
    $process = proc_open([PHP_BINARY,__DIR__.'/media-upload-server.php',$serverMode,$mode], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    check(is_resource($process), 'Native history TLS fixture starts');
    try {
        $fixture = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        [$address,$port] = explode(':', $fixture['address']);
        $native = GuzzleHttp\HandlerStack::create();
        $token = new CancellationToken();
        $handler = static function ($request, $options) use ($address, $port, $native, $token, $mode) {
            check(in_array($request->getUri()->getHost(), ['api.fixture.invalid','mmg.whatsapp.net'], true), 'Only approved history authorities reach fixture');
            if ($mode === 'cancelled') {
                $options['on_headers'] = static function () use ($token): void {
                    $token->cancel();
                };
            }
            return $native($request->withUri($request->getUri()->withHost($address)->withPort((int)$port), true), $options);
        };
        $http = new GuzzleHttp\Client(['handler' => $handler,'verify' => $fixture['ca'],'proxy' => '','headers' => ['Authorization' => 'must-not-replay','Cookie' => 'must-not-replay','X-Caller-Private' => 'must-not-replay']]);
        if (str_starts_with($mode, 'api')) {
            $api = new Polymorfa\MessagingClient($credential, baseUrl:'https://api.fixture.invalid', http:$http);
            $retry = ['syncType' => 'RECENT','chunkOrder' => 4294967295,'chunkMessageId' => 'fixture_message','regenerate' => false];
            if ($mode === 'api-error') {
                raises(fn () => $api->historySync->requestChunkRetry('session', $retry), ServerException::class);
            } else {
                check($api->historySync->requestChunkRetry('session', $retry)->data['data']['requestId'] === 'fixture_retry', 'Typed retry result');
                check($api->historySync->deleteChunk('session', '/fixture/history?ccb=1', str_repeat(chr(255), 32), 'handle', 'nonce', new RequestOptions(apiVersion:'2026-12-01'))->data['data']['status'] === 'deleted', 'Typed explicit delete result');
            }
        } else {
            $descriptor = new HistorySyncChunkDescriptor('/fixture/history', $historyBytes('mediaKey'), $historyBytes('fileSha256'), $historyBytes('fileEncSha256'), $historyFixture['fileLength']);
            $calls = 0;
            $decode = static function (string $raw) use (&$calls): void {
                ++$calls;
            };
            if ($mode === 'corrupt') {
                raises(fn () => HistorySyncCodec::download($descriptor, http:$http, decoder:$decode), MediaIntegrityException::class);
                check($calls === 0, 'Corrupt ciphertext never parsed');
            } elseif ($mode === 'cancelled') {
                raises(fn () => HistorySyncCodec::download($descriptor, http:$http, cancellation:$token, decoder:$decode), CancelledException::class);
                check($calls === 0, 'Cancelled ciphertext never parsed');
            } else {
                check(HistorySyncCodec::download($descriptor, http:$http, decoder:$decode)->protobuf === $historyBytes('protobuf') && $calls === 1, 'Native TLS encrypted history golden');
            }
        }
        fwrite($pipes[0], "finish\n");
        $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        check($state['valid'] && $state['posts'] === ($mode === 'api' ? 2 : 1), 'Actual history API/CDN wire, credential isolation, revisions and no automatic retry');
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }proc_close($process);
    }
}
$api = new Polymorfa\MessagingClient($credential, baseUrl:'http://127.0.0.1:1');
foreach ([['syncType' => 'INVALID','chunkOrder' => 0],['syncType' => 'RECENT','chunkOrder' => -1],['syncType' => 'RECENT','chunkOrder' => 4294967296],['syncType' => 'RECENT','chunkOrder' => 0,'chunkMessageId' => "private\nvalue"],['syncType' => 'RECENT','chunkOrder' => 0,'extra' => 'forbidden']] as $body) {
    raises(fn () => $api->historySync->requestChunkRetry('session', $body), ConfigurationException::class);
}
raises(fn () => $api->historySync->deleteChunk('session', 'https://evil.invalid', str_repeat('x', 32)), ConfigurationException::class);
raises(fn () => $api->historySync->deleteChunk('session', '/fixture', str_repeat('x', 31)), ConfigurationException::class);
echo "Local history golden, three compression formats, lossless protobuf/uint64/unknown fields, bounds, native TLS verification-before-decode and explicit API retry/delete passed.\n";

$browser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_fixture'));
raises(fn () => $browser->historySync->requestChunkRetry('session', ['syncType' => 'FULL','chunkOrder' => 0]), ConfigurationException::class);
raises(fn () => $browser->historySync->deleteChunk('session', '/fixture', str_repeat('x', 32)), ConfigurationException::class);

$historyVarint = static function (int $value): string {
    $out = '';
    while ($value > 127) {
        $out .= chr(($value & 127) | 128);
        $value >>= 7;
    }return $out.chr($value);
};
$original = HistorySyncCodec::decode($valid);
$rawMessage = $original->conversations[0]->messages[0]->protobuf;
$conversation = "\x0a\x08user@lid".str_repeat("\x12".$historyVarint(strlen($rawMessage)).$rawMessage, 2000);
$large = "\x08\x03\x12".$historyVarint(strlen($conversation)).$conversation;
$decoded = HistorySyncCodec::decode(gzcompress($large));
check(count($decoded->conversations[0]->messages) === 2000 && $decoded->protobuf === $large, '2000-message chunk retains exact bytes');
raises(fn () => HistorySyncCodec::decode(gzcompress("\x08\x03".str_repeat("\x2b", 66).str_repeat("\x2c", 66))), MediaIntegrityException::class);
