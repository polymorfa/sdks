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
check(count($history) === 1,'Revoked SSE never reconnects');
