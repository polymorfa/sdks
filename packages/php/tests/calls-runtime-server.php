<?php

declare(strict_types=1);
require dirname(__DIR__).'/vendor/autoload.php';
use WebSocket\{Server,Connection};
use WebSocket\Message\{Text,Binary};
use WebSocket\Middleware\{CloseHandler,PingResponder,SubprotocolNegotiation};
use Psr\Http\Message\{RequestInterface,ResponseInterface};

$state = getenv('POLYMORFA_CALLS_TEST_STATE');
$server = new Server(0);
$server->setTimeout(0.01)->addMiddleware(new CloseHandler())->addMiddleware(new PingResponder())->addMiddleware(new SubprotocolNegotiation(['pmfa.calls.v2'], false));
$connections = [];
$lifecycle = null;
$mediaAttempts = [];
$mediaHandles = [];
$connectionIds = [];
$offset = 0;
$record = static function (array $entry) use ($state): void {
    file_put_contents($state.'.ws', json_encode($entry, JSON_THROW_ON_ERROR)."\n", FILE_APPEND | LOCK_EX);
};
$event = static fn (string $name, string $id, array $payload): string => json_encode(['type' => 'event','event' => $name,'callId' => $id,'payload' => $payload,'timestamp' => '2026-10-11T00:00:00Z'], JSON_THROW_ON_ERROR);
$server->onHandshake(function (Server $server, Connection $connection, RequestInterface $request, ResponseInterface $response) use (&$connections, $record): void {
    if ($request->hasHeader('Authorization') || str_contains((string)$request->getUri(), 'pmfa_')) {
        throw new RuntimeException('Leaked socket credential.');
    }
    $path = $request->getUri()->getPath();
    if ($path === '/voip/ws') {
        if ($request->getUri()->getQuery() !== 'session=support') {
            throw new RuntimeException('Wrong lifecycle query.');
        }
    } elseif (!preg_match('#^/voip/calls/(incoming_1|outbound_1|ended_1|claimed_1)/media$#', $path) || $request->getUri()->getQuery() !== '' || $response->getHeaderLine('Sec-WebSocket-Protocol') !== 'pmfa.calls.v2') {
        throw new RuntimeException('Wrong media handshake.');
    }
    $connections[$connection->getIdentity()] = ['path' => $path,'auth' => false];
    $record(['type' => 'handshake','path' => $path]);
});
$server->onText(function (Server $server, Connection $connection, Text $message) use (&$connections, &$lifecycle, &$mediaAttempts, &$mediaHandles, &$connectionIds, $record, $event): void {
    $frame = json_decode($message->getContent(), true, flags:JSON_THROW_ON_ERROR);
    $context = &$connections[$connection->getIdentity()];
    if (!$context['auth']) {
        if (($frame['type'] ?? '') !== 'auth' || !is_string($frame['token'] ?? null)) {
            throw new RuntimeException('Auth must be first.');
        }
        $context['auth'] = true;
        if ($context['path'] === '/voip/ws') {
            if (array_keys($frame) !== ['type','token']) {
                throw new RuntimeException('Wrong lifecycle auth.');
            }
            $lifecycle = $connection;
            $connection->text('{"type":"ready","session":"support","participant":"server:default"}');
            $connection->text($event('call.ended', 'ghost', ['reason' => 'busy']));
            $connection->text($event('call.received', 'ghost', ['from' => '15550000003','direction' => 'incoming']));
            $connection->text($event('call.received', 'incoming_1', ['from' => '15550000001','direction' => 'incoming','hasVideo' => false,'capabilities' => ['video' => true,'invite' => true]]));
            $connection->text($event('call.accepted', 'incoming_1', ['answeredBy' => 'server:other','exclusive' => false]));
        } else {
            $id = explode('/', $context['path'])[3];
            $attempt = $mediaAttempts[$id] = ($mediaAttempts[$id] ?? 0) + 1;
            if (!is_string($frame['connectionId'] ?? null) || isset($frame['participant'])) {
                throw new RuntimeException('Wrong media auth.');
            }
            if (isset($connectionIds[$id]) && $connectionIds[$id] !== $frame['connectionId']) {
                throw new RuntimeException('Connection ID changed.');
            }
            $mediaHandles[$id] = $connection;
            $connectionIds[$id] = $frame['connectionId'];
            if ($attempt > 1 && $frame['token'] !== 'pmfa_pt_'.str_repeat('a', 93).'Q') {
                throw new RuntimeException('Reconnect failed to refresh credential.');
            }
            $connection->text('{"type":"ready","sampleRate":16000,"video":true}');
            $connection->text('{"type":"participant_joined","participant":{"id":"15550000001","audioMuted":false,"video":true,"state":"connected"}}');
            $connection->text('{"type":"remote_media","audioMuted":true}');
            $connection->text('{"type":"video_source","source":42,"connectionId":"connection_other","connectionParticipant":"server:other"}');
            $connection->binary("\x01\x02\x00\xfe\xff");
            $record(['type' => 'media_auth','callId' => $id,'attempt' => $attempt,'connectionId' => $frame['connectionId'],'refreshed' => $attempt > 1]);
        }
        return;
    }
    if (($frame['type'] ?? '') === 'media_state') {
        $record(['type' => 'preferences','callId' => explode('/', $context['path'])[3],'audioMuted' => $frame['audioMuted'] ?? false]);
        $connection->text(json_encode(['type' => 'media_state','requestId' => $frame['requestId'],'audioMuted' => $frame['audioMuted'] ?? false,'videoEnabled' => $frame['videoEnabled'] ?? false,'screenSharing' => $frame['screenSharing'] ?? false], JSON_THROW_ON_ERROR));
    } elseif (($frame['type'] ?? '') === 'ping') {
        $connection->text('{"type":"pong"}');
    } elseif (($frame['type'] ?? '') === 'auth') {
        $record(['type' => 'token_replaced']);
    } elseif (($frame['type'] ?? '') !== 'leave') {
        throw new RuntimeException('Unexpected control.');
    }
});
$server->onBinary(function (Server $server, Connection $connection, Binary $message) use (&$connections, $record): void {
    if ($message->getContent() !== "\x01\x01\x00\xff\xff") {
        throw new RuntimeException('Wrong PCM.');
    }
    $record(['type' => 'pcm']);
    $connection->close(4401, 'test refusal');
});
$server->onTick(function () use (&$offset, &$lifecycle, &$mediaHandles, $state): void {
    if ($lifecycle === null || !is_file($state.'.events')) {
        return;
    }
    $lines = file($state.'.events', FILE_IGNORE_NEW_LINES);
    while ($offset < count($lines)) {
        $event = json_decode($lines[$offset++], true, flags:JSON_THROW_ON_ERROR);
        if (isset($event['mediaClose'])) {
            $mediaHandles[$event['callId']]->close($event['mediaClose'], $event['reason'] ?? '');
            continue;
        }
        if (isset($event['close'])) {
            $lifecycle->close($event['close'], 'fixture');
            $lifecycle = null;
            continue;
        } $event['type'] = 'event';
        $event['timestamp'] = '2026-10-11T00:00:00Z';
        $lifecycle->text(json_encode($event, JSON_THROW_ON_ERROR));
    }
});
$server->onError(function (Server $server, ?Connection $connection, Throwable $error): void {
    fwrite(STDERR, $error->getMessage()."\n");
    $server->stop();
});
$local = stream_socket_get_name($server->getStream()->getResource(), false);
echo json_encode(['url' => 'http://127.0.0.1:'.substr($local, strrpos($local, ':') + 1)], JSON_THROW_ON_ERROR)."\n";
fflush(STDOUT);
$server->start();
