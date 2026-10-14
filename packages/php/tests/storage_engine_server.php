<?php

declare(strict_types=1);

// Actual loopback HTTP fixture for the public Events -> storage sync boundary.
$server = stream_socket_server('tcp://127.0.0.1:0', $error, $message);
if ($server === false) {
    throw new RuntimeException('loopback fixture bind failed');
}
echo json_encode(['url' => 'http://'.stream_socket_get_name($server, false)], JSON_THROW_ON_ERROR)."\n";
flush();
$fixture = json_decode(file_get_contents(__DIR__.'/fixtures/storage-conformance-fixtures.json'), true, flags:JSON_THROW_ON_ERROR);
$event = $fixture['events'][0];
$event['session'] = 's';
$frame = ['type' => 'event','streamId' => 'native-stream','sequence' => 9,'cursor' => 'new','event' => ['id' => 'native-event','organizationId' => 'org','projectId' => 'project','type' => $event['event'],'source' => 'runtime','environment' => 'development','createdAt' => $event['timestamp'],'payloadAvailability' => 'available','payload' => ['encoding' => 'base64','contentType' => 'application/json','data' => base64_encode(json_encode($event, JSON_THROW_ON_ERROR))],'replayableUntil' => null,'metadataExpiresAt' => $event['timestamp']]];
$valid = true;
$calls = [];
for ($i = 0;$i < 2;$i++) {
    $socket = stream_socket_accept($server, 10);
    if ($socket === false) {
        throw new RuntimeException('loopback fixture request missing');
    }
    stream_set_timeout($socket, 5);
    $request = fgets($socket);
    if ($request === false) {
        throw new RuntimeException('request line missing');
    } [$method,$url] = explode(' ', trim($request));
    $headers = [];
    while (($line = fgets($socket)) !== false && trim($line) !== '') {
        [$name,$value] = explode(':', $line, 2);
        $headers[strtolower($name)] = trim($value);
    }
    $length = (int)($headers['content-length'] ?? 0);
    $body = '';
    while (strlen($body) < $length) {
        $part = fread($socket, $length - strlen($body));
        if ($part === false || $part === '') {
            throw new RuntimeException('body truncated');
        } $body .= $part;
    }
    $parts = parse_url($url);
    $path = $parts['path'];
    parse_str($parts['query'] ?? '', $params);
    $calls[] = $method.' '.$path;
    if ($method === 'GET') {
        $valid = $valid && $path === '/platform/projects/project/events/stream' && ($params['ack'] ?? null) === 'manual' && ($headers['last-event-id'] ?? null) === 'old';
        $payload = 'data: '.json_encode($frame, JSON_THROW_ON_ERROR)."\n\n";
        fwrite($socket, "HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nContent-Length: ".strlen($payload)."\r\nConnection: close\r\n\r\n");
        fwrite($socket, substr($payload, 0, 17));
        fflush($socket);
        fwrite($socket, substr($payload, 17));
    } else {
        $valid = $valid && $method === 'POST' && $path === '/platform/projects/project/events/stream/native-stream/ack' && json_decode($body, true, flags:JSON_THROW_ON_ERROR) === ['cursor' => 'new','sequence' => 9];
        $payload = json_encode(['data' => ['streamId' => 'native-stream','acknowledgedCursor' => 'new','sequence' => 9,'replayed' => false]], JSON_THROW_ON_ERROR);
        fwrite($socket, "HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: ".strlen($payload)."\r\nConnection: close\r\n\r\n".$payload);
    }
    fclose($socket);
}
fclose($server);
echo json_encode(['valid' => $valid,'calls' => $calls],JSON_THROW_ON_ERROR)."\n";
