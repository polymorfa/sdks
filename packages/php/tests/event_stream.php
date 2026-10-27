<?php

declare(strict_types=1);
$webhookBody = ['id' => 'webhook-event','session' => 'session','timestamp' => '2026-10-11T00:00:00Z','event' => 'future.event','payload' => ['opaque' => ['key' => false]]];
$event = ['id' => 'event','organizationId' => 'org','projectId' => 'project','type' => 'future.event','source' => 'runtime','environment' => 'development','createdAt' => '2026-10-11T00:00:00Z','payloadAvailability' => 'available','payload' => ['encoding' => 'base64','contentType' => 'application/json','data' => base64_encode(json_encode($webhookBody, JSON_THROW_ON_ERROR))],'replayableUntil' => null,'metadataExpiresAt' => '2026-11-11T00:00:00Z'];
$frame = ['type' => 'event','event' => $event,'cursor' => 'cursor2','streamId' => 'stream','sequence' => 1];
$wire = ': heartbeat'."\r\n\r\n".'data: '.json_encode(['type' => 'checkpoint','cursor' => 'checkpoint'], JSON_THROW_ON_ERROR)."\r\n\r\n".'data: '.json_encode($frame, JSON_THROW_ON_ERROR)."\r\n\r\n";
$invoke = function ($client) use ($event, $webhookBody) {
    $stream = $client->events->stream('project', 'cursor1', ['future.*'], true);
    $delivered = null;
    foreach ($stream as $item) {
        $delivered = $item;
        check($item['webhook']?->raw === $webhookBody && $item['webhook']?->known === false, 'SSE decodes exact base64 webhook and preserves unknown event');
        check($stream->cursor === 'cursor2', 'SSE advances resume cursor');
        $stream->close();
    }
    check($delivered !== null && $stream->metadata !== null, 'SSE delivery metadata retained after graceful close');
    return new Polymorfa\ApiResponse(['event' => $delivered['event'],'cursor' => $delivered['cursor'],'sequence' => $delivered['sequence'],'streamId' => $delivered['streamId']], $stream->metadata);
};
nativeCases([
 ['GET','/platform/projects/project/events/stream?types=future.%2A&ack=manual',null,$wire,$invoke,['event' => $event,'cursor' => 'cursor2','sequence' => 1,'streamId' => 'stream'],['responseHeaders' => ['Content-Type' => 'text/event-stream; charset=utf-8'],'requestHeaders' => ['accept' => 'text/event-stream','last-event-id' => 'cursor1']]],
], fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
// Closing an unstarted stream never opens a connection.
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([], $history));
$stream = $client->project('project')->events->stream();
$stream->close();
check(iterator_to_array($stream) === [] && $history === [], 'Unstarted SSE close is graceful');
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], "data: {\"type\":\"revoked\"}\n\n")], $history));
raises(fn () => iterator_to_array($client->project('project')->events->stream()), Polymorfa\AuthorizationException::class);
check(count($history) === 1, 'Revoked SSE never reconnects');
$parser = new Polymorfa\SseParser();
$parsed = [];
foreach (str_split("data: first\r\ndata: second\r\n\r\n: heartbeat\r\rdata: third\n\n") as $byte) {
    $parsed = [...$parsed,...$parser->feed($byte)];
}
check($parsed === ["first\nsecond",'third'], 'SSE line parser handles CRLF split at every byte and CR-only lines');
foreach ([[-1,1],[1,0],[INF,1],[0,NAN]] as [$initial,$maximum]) {
    raises(fn () => new Polymorfa\EventStreamOptions($initial, $maximum), Polymorfa\ConfigurationException::class);
}
$history = [];
$gaps = [];
$reconnects = [];
$client = new Polymorfa\Client($credential, http:mocked([
 new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], "data: {\"type\":\"checkpoint\",\"cursor\":\"quiet\"}\n\ndata: {\"type\":\"gap\",\"reason\":\"retention_exceeded\",\"missedEvents\":2}\n\ndata: {\"type\":\"expiry\"}\n\n"),
 new GuzzleHttp\Psr7\Response(429, ['retry-after' => '0'], json_encode(['error' => ['message' => 'wait']])),
 new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], "data: ".json_encode($frame)."\n\n"),
], $history));
$settings = new Polymorfa\EventStreamOptions(0, 0, onGap:function ($gap) use (&$gaps): void {
    $gaps[] = $gap;
}, onReconnect:function ($error, $delay) use (&$reconnects): void {
    $reconnects[] = [$error->errorCode,$delay];
});
$stream = $client->project('project')->events->stream(streamOptions:$settings);
foreach ($stream as $item) {
    $stream->close();
}
check($gaps === [['reason' => 'retention_exceeded','missedEvents' => 2,'requestedCursor' => null]] && count($history) === 3 && $history[1]['request']->getHeaderLine('Last-Event-ID') === 'quiet', 'SSE retention callback and quiet checkpoint resume');
check(count($reconnects) === 2 && $reconnects[0] === ['stream_expiry',0.0] && $reconnects[1][1] === 0.0, 'SSE expiry resets backoff and Retry-After is bounded');
$cancel = new Polymorfa\CancellationToken();
$cancel->cancel();
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([], $history));
check(iterator_to_array($client->project('project')->events->stream(options:new Polymorfa\RequestOptions(cancellation:$cancel))) === [] && $history === [], 'Cancelled unstarted SSE ends gracefully');
$process = proc_open([PHP_BINARY,__DIR__.'/event-stream-server.php'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes, null, ['SSE_TEST_EVENT' => json_encode($event, JSON_THROW_ON_ERROR)] + getenv());
try {
    $ready = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
    $client = new Polymorfa\Client($credential, baseUrl:$ready['url']);
    $gaps = [];
    $failures = [];
    $settings = new Polymorfa\EventStreamOptions(0, 0, onGap:function ($gap) use (&$gaps): void {
        $gaps[] = $gap;
    }, onReconnect:function ($error, $delay) use (&$failures): void {
        $failures[] = $error->errorCode;
    });
    $stream = $client->project('project')->events->stream(streamOptions:$settings);
    $items = [];
    foreach ($stream as $item) {
        $items[] = $item;
        $stream->close();
    }
    check(count($items) === 1 && $items[0]['cursor'] === 'delivered' && $gaps[0]['missedEvents'] === 3 && $failures === ['heartbeat_missed'], 'Native SSE watchdog reconnect and retention callback');
    check(json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR)['valid'] && json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR)['valid'], 'Native SSE exact credentials/path/resume cursor');
} finally {
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }proc_terminate($process);
    proc_close($process);
}
echo "SSE native heartbeat watchdog, retention/reconnect callbacks and incremental CR line parsing passed.\n";
$history = [];
$malformed = $frame;
$malformed['event']['payload']['data'] = '%%%';
$client = new Polymorfa\Client($credential, http:mocked([
 new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], 'data: '.json_encode($malformed)."\n\n"),
 new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], 'data: '.json_encode($frame)."\n\n"),
], $history));
$failures = [];
$settings = new Polymorfa\EventStreamOptions(0, 0, onReconnect:function ($error, $delay) use (&$failures): void {
    $failures[] = $error->errorCode;
});
$stream = $client->project('project')->events->stream(streamOptions:$settings);
foreach ($stream as $item) {
    check($item['webhook'] !== null, 'Recovered stream retains valid payload');
    $stream->close();
}
check($failures === ['invalid_response'] && count($history) === 2, 'Malformed retained stream payload reconnects instead of silently dropping content');
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], 'data: '.json_encode($frame)."\n\ndata: ".json_encode($frame)."\n\n")], $history));
$stream = $client->project('project')->events->stream();
$count = 0;
foreach ($stream as $item) {
    $count++;
    $stream->close();
}
check($count === 1, 'Closing SSE discards additional frames already buffered in the same network read');
$history = [];
$transport = new Polymorfa\HttpTransport($credential, http:mocked([], $history));
foreach ([0,-1,INF,NAN] as $readTimeout) {
    raises(fn () => $transport->openStream('GET', '/platform/projects/project/events/stream', readTimeout:$readTimeout), Polymorfa\ConfigurationException::class);
}
check($history === [], 'Invalid stream read bounds fail before network access');
$withoutPayload = $frame;
$withoutPayload['event']['payload'] = null;
$withoutPayload['cursor'] = 'skipped';
$sourceWire = 'data: '.json_encode($withoutPayload)."\n\ndata: ".json_encode($frame)."\n\n";
nativeCases([
 ['GET','/platform/projects/project/events/stream?types=future.%2A',null,$sourceWire,function ($client) use ($webhookBody) {
     $source = $client->project('project')->events->liveSource(types:['future.*']);
     $delivered = [];
     $subscription = null;
     $subscription = $source->subscribe(function ($events, $metadata) use (&$subscription, &$delivered, $webhookBody): void {
         check(count($events) === 1 && $events[0]->raw === $webhookBody && $metadata['cursor'] === 'cursor2', 'Native live source retained body/cursor');
         $delivered[] = $metadata['cursor'];
         $subscription->close();
     }, cursor:'saved');
     $subscription->pump();
     $subscription->pump();
     check($delivered === ['cursor2'], 'Live source skips missing payload and close prevents additional deliveries');
     return new Polymorfa\ApiResponse($delivered, $subscription->metadata());
 },['cursor2'],['responseHeaders' => ['Content-Type' => 'text/event-stream'],'requestHeaders' => ['last-event-id' => 'saved']]],
], fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], "data: {\"type\":\"revoked\"}\n\n")], $history));
$error = null;
$subscription = $client->project('project')->events->liveSource()->subscribe(function (): void {
    throw new RuntimeException('Unexpected payload');
}, onError:function ($failure) use (&$error): void {
    $error = $failure;
});
$subscription->pump();
check($error instanceof Polymorfa\AuthorizationException && $error->errorCode === 'stream_revoked', 'Live source terminal error callback');
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([], $history));
$subscription = $client->project('project')->events->liveSource()->subscribe(function (): void {
});
$subscription->close();
$subscription->pump();
check($history === [], 'Closed unstarted live source opens no connection');

foreach (['%%%', base64_encode('{}')] as $invalidPayload) {
    $history = [];
    $bad = $frame;
    $bad['cursor'] = 'bad';
    $bad['event']['payload']['data'] = $invalidPayload;
    $good = $frame;
    $good['cursor'] = 'good';
    $failures = [];
    $client = new Polymorfa\Client($credential, http:mocked([
        new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], 'data: '.json_encode($good)."\n\ndata: ".json_encode($bad)."\n\n"),
        new GuzzleHttp\Psr7\Response(200, ['content-type' => 'text/event-stream'], "data: {\"type\":\"revoked\"}\n\n"),
    ], $history));
    $stream = $client->project('project')->events->stream(since:'initial', manualAck:true, streamOptions:new Polymorfa\EventStreamOptions(0, 0, onReconnect:function ($error, $delay) use (&$failures): void {
        $failures[] = $error->errorCode;
    }));
    $delivered = [];
    raises(function () use ($stream, &$delivered): void {
        foreach ($stream as $item) {
            $delivered[] = $item['cursor'];
        }
    }, Polymorfa\AuthorizationException::class);
    check($failures === ['invalid_response'] && $delivered === ['good'] && $stream->cursor === 'good', 'Invalid payload cannot advance delivered/resume cursor');
    check(count($history) === 2 && $history[1]['request']->getHeaderLine('Last-Event-ID') === 'good', 'Invalid base64/envelope reconnects from valid cursor');
}
$limit = 4 * 1024 * 1024;
foreach (['x', '🦀', 'data: '.str_repeat(' ', 1024)."\n", ': '.str_repeat('x', 1024)."\n"] as $segment) {
    $parser = new Polymorfa\SseParser();
    $wire = str_repeat($segment, intdiv($limit, strlen($segment)) + 1);
    raises(function () use ($parser, $wire): void {
        foreach (str_split($wire, 4093) as $chunk) {
            $parser->feed($chunk);
        }
    }, Polymorfa\ServerException::class);
}
$tail = "\ndata: boundary\n\n";
$padding = $limit - strlen($tail) - 1;
$wire = ':'.str_repeat('🦀', intdiv($padding, 4)).str_repeat('x', $padding % 4).$tail;
check(strlen($wire) === $limit, 'UTF-8 frame boundary fixture');
$parser = new Polymorfa\SseParser();
$frames = [];
foreach (str_split($wire.$wire, 4093) as $chunk) {
    $frames = [...$frames, ...$parser->feed($chunk)];
}
check($frames === ['boundary', 'boundary'], 'Frame byte boundary accepted and reset at blank line');
