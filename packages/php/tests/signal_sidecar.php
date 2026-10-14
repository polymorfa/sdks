<?php

declare(strict_types=1);

use Polymorfa\{CancelledException,CancellationToken,ConfigurationException,MediaEncryption,SignalEvent,SignalMediaDescriptor,SignalSendRequest,SignalSidecarClient,SignalSidecarException,SignalSseParser,SignalWebhooks,WebhookSignatureException,WhatsAppMediaUploadResult,WhatsAppUploadLocation};

$v = json_decode(file_get_contents(__DIR__.'/fixtures/signal-sidecar.json'), true, flags:JSON_THROW_ON_ERROR);
foreach (['valid','redirect','body','headers','wrong-id','wrong-type','cancel'] as $mode) {
    $process = proc_open([PHP_BINARY,__DIR__.'/signal-server.php',$mode], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
    check(is_resource($process), 'Native Signal TCP fixture starts');
    try {
        $fixture = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        $http = new GuzzleHttp\Client(['proxy' => '','headers' => ['Authorization' => 'must-not-replay','Cookie' => 'must-not-replay','Origin' => 'null','Polymorfa-Version' => 'must-not-replay','Last-Event-ID' => 'must-not-replay','X-Caller-Private' => 'must-not-replay']]);
        $client = new SignalSidecarClient($fixture['url'], $v['secret'], $http, timeout:in_array($mode, ['body','headers'], true) ? 0.05 : 3);
        if ($mode === 'valid') {
            $client->health();
            check($client->sessions()->sessions[0]->leaseGeneration === 7, 'Typed local session lease generation');
            check($client->send('session-fixture', new SignalSendRequest('target@lid', 'fixture'))->serverTimestamp === 1720000000, 'Typed text send');
            $encrypted = MediaEncryption::encrypt('fixture', 'ptt', str_repeat(chr(1), 32), mimeType:'audio/ogg');
            $descriptor = SignalMediaDescriptor::fromUpload(new WhatsAppMediaUploadResult($encrypted->info, new WhatsAppUploadLocation('/fixture/path', 'https://cdn.whatsapp.net/fixture/path'), 'relay'));
            $client->send('session-fixture', new SignalSendRequest('target@lid', media:$descriptor));
            $stream = $client->events('session-fixture');
            $count = 0;
            foreach ($stream as $event) {
                $count++;
                check($event->id === $v['eventId'] && $event->timestamp === 1720000000 && $event->senderAlt === 'alternate@lid' && $event->rawJson === $v['rawBody'], 'Immediate native SSE exact envelope/protobuf');
                check(json_encode($event) === '{"redacted":true}' && !str_contains(print_r($event, true), 'private fixture'), 'Signal event redaction');
                break;
            }$stream->close();
            check($count === 1, 'One SSE record without auto reconnect');
            $client->acknowledge($v['eventId']);
            $error = raises(fn () => $client->acknowledge($v['eventId']), SignalSidecarException::class);
            check($error->status === 404, 'Duplicate ACK404 preserved');
        } elseif ($mode === 'cancel') {
            $started = microtime(true);
            $stream = $client->events('session-fixture', CancellationToken::after(0.05));
            raises(static function () use ($stream): void {
                foreach ($stream as $event) {
                }
            }, CancelledException::class);
            check(microtime(true) - $started < 1.5, 'Stalled SSE body cancellation bounded');
            $stream->close();
        } elseif (in_array($mode, ['wrong-id','wrong-type'], true)) {
            $stream = $client->events('session-fixture');
            raises(static function () use ($stream): void {
                foreach ($stream as $event) {
                }
            }, SignalSidecarException::class);
            $stream->close();
        } else {
            $error = raises($mode === 'headers' ? fn () => $client->events('session-fixture') : fn () => $client->sessions(), SignalSidecarException::class);
            check(!str_contains($error->getMessage(), 'capability=') && $error->getPrevious() === null, 'Sidecar failures omit private URL and causes');
            if ($mode !== 'redirect') {
                check($error->errorCode === 'signal_sidecar_timeout', 'Sidecar body/header deadline');
            }
        }
        fwrite($pipes[0], "finish\n");
        $state = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
        check($state['valid'], 'Native sidecar excludes API/cookie/Origin/Last-Event-ID defaults and uses app bearer');
        check($state['acks'] === ($mode === 'valid' ? 2 : 0), 'SSE never automatically ACKs');
        if ($mode === 'valid') {
            check($state['sends'] === 2, 'Text and ptt media use exact local wire');
        } else {
            check($state['calls'] === 1, 'No redirects or automatic retries');
        }
    } finally {
        proc_terminate($process);
        foreach ($pipes as $pipe) {
            fclose($pipe);
        }proc_close($process);
    }
}
foreach ([['to' => ''],['to' => 'target'],['to' => 'target','text' => '']] as $bad) {
    raises(fn () => new SignalSendRequest(...$bad), ConfigurationException::class);
}
$cancelled = new CancellationToken();
$cancelled->cancel();
$client = new SignalSidecarClient('http://127.0.0.1:1', $v['secret']);
raises(fn () => $client->sessions($cancelled), CancelledException::class);
$event = SignalWebhooks::constructEvent($v['rawBody'], $v['signature'], $v['timestamp'], $v['eventId'], $v['secret'], nowUnixSeconds:(int)$v['timestamp']);
check($event->rawJson === $v['rawBody'], 'Independent exact raw-body HMAC vector');
$calls = 0;
$persist = static function (SignalEvent $event) use (&$calls): bool {
    return ++$calls === 1;
};
for ($i = 0;$i < 2;$i++) {
    $result = SignalWebhooks::process($v['rawBody'], $v['signature'], $v['timestamp'], $v['eventId'], $v['secret'], $persist, nowUnixSeconds:(int)$v['timestamp']);
    check($result['duplicate'] === ($i === 1), 'Durable dedup hook succeeds before caller2xx');
}
foreach (['body','signature','timestamp','event-id'] as $change) {
    $raw = $v['rawBody'];
    $signature = $v['signature'];
    $timestamp = $v['timestamp'];
    $id = $v['eventId'];
    match($change) {
        'body' => $raw .= ' ','signature' => $signature = strtoupper($signature),'timestamp' => $timestamp = '1',default => $id = 'wrong'
    };
    raises(fn () => SignalWebhooks::process($raw, $signature, $timestamp, $id, $v['secret'], $persist, nowUnixSeconds:(int)$v['timestamp']), WebhookSignatureException::class);
}check($calls === 2, 'Invalid signatures never reach persistence');
$error = raises(fn () => SignalWebhooks::process($v['rawBody'], $v['signature'], $v['timestamp'], $v['eventId'], $v['secret'], static fn (SignalEvent $event) => throw new RuntimeException('private store secret'), nowUnixSeconds:(int)$v['timestamp']), SignalSidecarException::class);
check($error->errorCode === 'signal_webhook_persistence_failed' && $error->getPrevious() === null, 'Failed durable write cannot become accepted webhook');
$parser = new SignalSseParser();
$wire = "id: event-fixture\revent: message\rdata: ".$v['rawBody']."\r\r";
$frames = [];
foreach (str_split($wire) as $byte) {
    $frames = array_merge($frames, $parser->feed($byte));
}check(count($frames) === 1 && $frames[0]['data'] === $v['rawBody'], 'Byte-split CR-only framing');
$history = json_decode($v['rawBody'], true, flags:JSON_THROW_ON_ERROR);
$history['type'] = 'history.sync';
$history['message_proto'] = '';
$history['history'] = ['notification_proto' => 'CgA=','sync_type' => 6,'direct_path' => null,'media_key' => null];
check(SignalEvent::fromJson(json_encode($history))->history->syncType === 6, 'Nullable INTEGER history enum and empty message_proto');
$history['history']['sync_type'] = 'RECENT';
raises(fn () => SignalEvent::fromJson(json_encode($history)), SignalSidecarException::class);
echo "Native Signal HTTP/SSE/media/manualACK, header isolation, deadlines, exact HMAC/durable hooks, raw protobuf and nullable history enum passed.\n";
$directory = getenv('POLYMORFA_SIGNAL_FIXTURE_DIRECTORY');
if ($directory !== false && $directory !== '') {
    $metadata = json_decode(file_get_contents($directory.'/metadata.json'), true, flags:JSON_THROW_ON_ERROR);
    check($metadata['syntheticOnly'] && $metadata['sourceCommit'] === SignalSidecarClient::SOURCE_COMMIT, 'Actual service fixture exact source');
    $host = getenv('POLYMORFA_SIGNAL_FIXTURE_HOST');
    $http = null;
    if ($host !== false && $host !== '') {
        $native = GuzzleHttp\HandlerStack::create();
        $http = new GuzzleHttp\Client(['proxy' => '','handler' => static function ($request, $options) use ($host, $native) {
            check($request->getUri()->getHost() === '127.0.0.1', 'Docker service fixture transport preserves logical loopback authority');
            return $native($request->withUri($request->getUri()->withHost($host), true), $options);
        }]);
    }
    $client = new SignalSidecarClient($metadata['url'], $metadata['applicationSecret'], $http, timeout:10);
    $client->health();
    $sessions = $client->sessions();
    check(count($sessions->sessions) === 1 && $sessions->sessions[0]->id === $metadata['sessionId'] && $sessions->sessions[0]->claimed && $sessions->sessions[0]->hasDeviceKeys, 'Actual service is ready with synthetic keys/pairing');
    $wrong = new SignalSidecarClient($metadata['url'], 'synthetic_wrong_application_secret', $http);
    check(raises(fn () => $wrong->sessions(), SignalSidecarException::class)->status === 401, 'Actual service rejects wrong app bearer');
    $outcome = $client->send($metadata['sessionId'], new SignalSendRequest('111@s.whatsapp.net', 'synthetic PHP native send'));
    check($outcome->messageId !== '', 'Actual service synthetic text send encrypts through core/fake WS');
    $encrypted = MediaEncryption::encrypt('synthetic app media', 'ptt', mimeType:'audio/ogg');
    $descriptor = SignalMediaDescriptor::fromUpload(new WhatsAppMediaUploadResult($encrypted->info, new WhatsAppUploadLocation('/synthetic/fixture.enc', 'https://cdn.whatsapp.net/synthetic/fixture.enc'), 'relay'));
    check($client->send($metadata['sessionId'], new SignalSendRequest('111@s.whatsapp.net', media:$descriptor))->messageId !== '', 'Actual synthetic media send');
    clearstatcache();
    $before = file_exists($directory.'/receipt.json') ? filemtime($directory.'/receipt.json') : 0;
    while (time() <= $before) {
        usleep(20000);
    }
    $message = 'php-native-'.bin2hex(random_bytes(12));
    $text = 'synthetic PHP native sidecar fixture';
    $inject = proc_open([PHP_BINARY,__DIR__.'/signal-inject.php',$directory,$message,$text], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $injectPipes);
    $stream = null;
    try {
        $stream = $client->events($metadata['sessionId']);
        $persisted = false;
        foreach ($stream as $event) {
            check($event->messageId === $message && $event->text === $text && $event->timestamp === 1720000000 && $event->senderAlt === '123456@lid' && str_contains($event->messageProto, $text), 'Actual encrypted Receive -> native plaintext/protobuf/stanza metadata');
            $root = dirname($directory).'/php-signal-sidecar-proof';
            if (!is_dir($root)) {
                mkdir($root, 0700, true);
            }$path = $root.'/'.hash('sha256', $event->id).'.json';
            $file = fopen($path, 'x+b');
            chmod($path, 0600);
            check(fwrite($file, $event->rawJson) === strlen($event->rawJson) && fflush($file) && fsync($file), 'Caller durable file fsync beforeACK');
            fclose($file);
            $parent = fopen($root, 'r');
            check($parent !== false && fsync($parent), 'Caller directory fsync beforeACK');
            fclose($parent);
            $persisted = true;
            $client->acknowledge($event->id);
            check(raises(fn () => $client->acknowledge($event->id), SignalSidecarException::class)->status === 404, 'Actual repeatedACK404');
            break;
        }
        $stream->close();
        check($persisted, 'Actual service event persisted');
        $acknowledged = false;
        $deadline = microtime(true) + 6;
        while (microtime(true) < $deadline) {
            clearstatcache();
            if (file_exists($directory.'/receipt.json') && filemtime($directory.'/receipt.json') > $before) {
                $receipt = json_decode(file_get_contents($directory.'/receipt.json'), true);
                if (($receipt['acknowledged'] ?? false) === true) {
                    $acknowledged = true;
                    break;
                }
            }usleep(20000);
        }check($acknowledged, 'Actual service fresh acknowledged receipt');
        echo "Actual PHP HTTP -> pinned service/core synthetic text/media sends and encrypted Receive -> native protobuf -> caller fsync -> manualACK -> acknowledged receipt passed.\n";
    } finally {
        $stream?->close();
        foreach ($injectPipes as $pipe) {
            fclose($pipe);
        }proc_close($inject);
    }
}
