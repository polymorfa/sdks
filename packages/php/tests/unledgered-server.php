<?php

declare(strict_types=1);
$listener = stream_socket_server('tcp://127.0.0.1:0', $errno, $error);
if ($listener === false) {
    throw new RuntimeException($error);
}
echo json_encode(['url' => 'http://'.stream_socket_get_name($listener, false)])."\n";
flush();
$records = [];
while (($socket = stream_socket_accept($listener, 30)) !== false) {
    $line = fgets($socket);
    if ($line === false) {
        fclose($socket);
        continue;
    }
    $path = explode(' ', trim($line))[1];
    $headers = [];
    while (($line = fgets($socket)) !== false && trim($line) !== '') {
        [$key, $value] = explode(':', $line, 2);
        $headers[strtolower($key)] = trim($value);
    }
    $body = '';
    $length = (int)($headers['content-length'] ?? 0);
    while (strlen($body) < $length && !feof($socket)) {
        $body .= fread($socket, $length - strlen($body));
    }
    $status = 200;
    if ($path === '/__state') {
        $result = $records;
    } elseif ($path === '/__reset') {
        $records = [];
        $result = [];
    } else {
        $records[] = ['path' => $path, 'headers' => $headers, 'length' => strlen($body)];
        $mode = $headers['x-outcome'] ?? '503';
        if ($mode === 'drop') {
            fclose($socket);
            continue;
        }
        $status = (int)$mode;
        if (($headers['x-control'] ?? '') === 'yes' && count($records) > 1) {
            $status = 200;
        }
        $result = $status === 200 ? ['success' => true, 'data' => ['id' => 'message', 'status' => 'sent']] : ['error' => ['code' => 'fixture_failure', 'message' => 'unknown outcome']];
    }
    $wire = json_encode($result, JSON_THROW_ON_ERROR);
    fwrite($socket, "HTTP/1.1 $status Fixture\r\nContent-Type: application/json\r\nRetry-After: 0\r\nX-Request-Id: unledgered\r\nContent-Length: ".strlen($wire)."\r\nConnection: close\r\n\r\n".$wire);
    fclose($socket);
}
fclose($listener);
