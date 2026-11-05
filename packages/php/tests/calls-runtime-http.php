<?php

declare(strict_types=1);
$state = getenv('POLYMORFA_CALLS_TEST_STATE');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/__ready') {
    echo '{}';
    return;
}
$body = json_decode(file_get_contents('php://input'), true);
$record = ['method' => $_SERVER['REQUEST_METHOD'],'path' => $path,'body' => $body,'authorization' => $_SERVER['HTTP_AUTHORIZATION'] ?? '', 'idempotency' => $_SERVER['HTTP_IDEMPOTENCY_KEY'] ?? null];
file_put_contents($state.'.http', json_encode($record, JSON_THROW_ON_ERROR)."\n", FILE_APPEND | LOCK_EX);
header('Content-Type: application/json');
header('X-Request-Id: calls_native');
if ($path === '/messaging/voip/calls') {
    if (($body['session'] ?? null) !== 'support' || isset($body['participant']) || $record['idempotency'] === null) {
        http_response_code(422);
        echo '{"error":{"code":"wire_mismatch"}}';
        return;
    }
    file_put_contents($state.'.events', json_encode(['event' => 'call.accepted','callId' => 'outbound_1','payload' => ['answeredBy' => 'remote','exclusive' => false]], JSON_THROW_ON_ERROR)."\n", FILE_APPEND | LOCK_EX);
    echo '{"success":true,"data":{"callId":"outbound_1","session":"support","video":false}}';
} elseif (str_ends_with($path, '/accept')) {
    echo '{"success":true,"data":{"answered":true,"answeredBy":"server:default","exclusive":false}}';
} elseif (str_ends_with($path, '/participants')) {
    echo '{"success":true,"data":{"participantId":"15550000002"}}';
} else {
    echo '{"success":true}';
}
