<?php

declare(strict_types=1);
if ($_SERVER['REQUEST_URI'] === '/ready') {
    echo 'ready';
    return;
}
if ($_SERVER['REQUEST_METHOD'] !== 'GET' || parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH) !== '/platform/calls/export' || ($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== ('Bearer pmfa_'.str_repeat('a', 72))) {
    http_response_code(400);
    echo 'bad request';
    return;
}
parse_str(parse_url($_SERVER['REQUEST_URI'], PHP_URL_QUERY) ?? '', $query);
if (($query['projectId'] ?? null) !== 'p1' || ($_SERVER['HTTP_ACCEPT'] ?? '') !== (($query['format'] ?? '') === 'csv' ? 'text/csv' : 'application/x-ndjson')) {
    http_response_code(400);
    echo 'bad filters';
    return;
}
header('X-Request-Id: call_export_wire');
if ($query['format'] === 'csv') {
    header('Content-Type: text/csv');
    if (!isset($query['cursor'])) {
        header('Polymorfa-Next-Cursor: next');
        echo "callId\r\nc1\r\n";
    } else {
        echo "callId\r\nc2\r\n";
    }
} else {
    header('Content-Type: application/x-ndjson');
    echo "{\"callId\":\"c1\"}\n";
}
