<?php

declare(strict_types=1);

require dirname(__DIR__).'/vendor/autoload.php';

use WebSocket\{Server,Connection};
use WebSocket\Message\{Text,Binary};
use WebSocket\Middleware\{CloseHandler,PingResponder,SubprotocolNegotiation};
use Psr\Http\Message\{RequestInterface,ResponseInterface};

$server = new Server(0);
$server->setTimeout(0.1)->addMiddleware(new CloseHandler())->addMiddleware(new PingResponder())->addMiddleware(new SubprotocolNegotiation(['pmfa.calls.v2'], true));
$handshake = false;
$authenticated = false;
$pcm = false;
$server->onHandshake(function (Server $server, Connection $connection, RequestInterface $request, ResponseInterface $response) use (&$handshake): void {
    if ($request->getUri()->getPath() !== '/voip/calls/call_fixture/media' || $request->getUri()->getQuery() !== '' || $request->hasHeader('Authorization') || $response->getHeaderLine('Sec-WebSocket-Protocol') !== 'pmfa.calls.v2') {
        throw new RuntimeException('Unsafe Calls handshake.');
    }
    $handshake = true;
});
$server->onText(function (Server $server, Connection $connection, Text $message) use (&$handshake, &$authenticated, &$pcm): void {
    $frame = json_decode($message->getContent(), true, flags:JSON_THROW_ON_ERROR);
    if (!$authenticated) {
        if (!$handshake || $frame !== ['type' => 'auth','token' => 'pmfa_ct_fixture','connectionId' => 'connection_fixture']) {
            throw new RuntimeException('Invalid Calls authentication frame.');
        }
        $authenticated = true;
        $connection->text('{"type":"ready","sampleRate":16000,"video":true}');
    } elseif ($frame === ['type' => 'leave'] && $pcm) {
        echo "verified\n";
        fflush(STDOUT);
        $server->stop();
    } else {
        throw new RuntimeException('Unexpected Calls control frame.');
    }
});
$server->onBinary(function (Server $server, Connection $connection, Binary $message) use (&$authenticated, &$pcm): void {
    if (!$authenticated || $message->getContent() !== "\x01\x01\x00\xff\xff") {
        throw new RuntimeException('Invalid Calls PCM frame.');
    }
    $pcm = true;
    $connection->binary("\x01\x02\x00\xfe\xff");
});
$local = stream_socket_get_name($server->getStream()->getResource(), false);
echo json_encode(['url' => 'http://127.0.0.1:'.substr($local, strrpos($local, ':') + 1)], JSON_THROW_ON_ERROR)."\n";
fflush(STDOUT);
$server->start();
