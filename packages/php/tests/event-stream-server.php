<?php

declare(strict_types=1);
$server = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
echo json_encode(['url' => 'http://'.stream_socket_get_name($server, false)])."\n";
flush();
$event = json_decode((string)getenv('SSE_TEST_EVENT'), true, flags:JSON_THROW_ON_ERROR);
for ($index = 0;$index < 2;$index++) {
    $socket = stream_socket_accept($server, 3);
    if ($socket === false) {
        break;
    }
    $lines = [];
    while (($line = fgets($socket)) !== false && trim($line) !== '') {
        $lines[] = trim($line);
    }
    $request = implode("\n", $lines);
    $valid = str_starts_with($request, 'GET /platform/projects/project/events/stream HTTP/1.1') && str_contains(strtolower($request), 'authorization: bearer pmfa_aaecawqfbgcicqolda0odxarehm73f-k');
    if ($index === 1) {
        $valid = $valid && str_contains(strtolower($request), 'last-event-id: checkpoint');
    }
    fwrite($socket, "HTTP/1.1 ".($valid ? '200 OK' : '422 Invalid')."\r\nContent-Type: text/event-stream\r\nX-Request-Id: native_request\r\nConnection: close\r\n\r\n");
    if ($index === 0) {
        fwrite($socket, 'data: {"type":"ready","heartbeatIntervalMs":20}' ."\r\r".'data: {"type":"checkpoint","cursor":"checkpoint"}'."\r\r".'data: {"type":"gap","reason":"retention_exceeded","missedEvents":3,"requestedCursor":"old"}'."\r\r");
        usleep(300000);
    } else {
        fwrite($socket, 'data: '.json_encode(['type' => 'event','event' => $event,'cursor' => 'delivered','streamId' => 'second','sequence' => 1], JSON_THROW_ON_ERROR)."\r\n\r\n");
    }
    fclose($socket);
    echo json_encode(['valid' => $valid,'attempt' => $index + 1])."\n";
    flush();
}
fclose($server);
