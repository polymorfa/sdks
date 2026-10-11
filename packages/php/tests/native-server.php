<?php

declare(strict_types=1);

$state = getenv('POLYMORFA_PHP_WIRE_STATE');
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
if ($path === '/__case') {
    file_put_contents($state, file_get_contents('php://input'));
    header('Content-Type: application/json');
    echo '{}';
    return;
}
$fixture = json_decode(file_get_contents($state), true, flags: JSON_THROW_ON_ERROR);
$actual = json_decode(file_get_contents('php://input'), true);
$failure = $_SERVER['REQUEST_METHOD'] !== $fixture['method'] || $_SERVER['REQUEST_URI'] !== $fixture['path'] || $actual !== $fixture['body'];
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$failure = $failure || ($headers['authorization'] ?? '') !== $fixture['authorization'] || ($headers['polymorfa-version'] ?? '') !== '2026-09-22';
if ($failure) {
    http_response_code(422);
    header('Content-Type: application/json');
    echo json_encode(['error' => ['code' => 'wire_mismatch','message' => 'Native request differs from the handwritten fixture.']]);
    return;
}
http_response_code($fixture['status'] ?? 200);
header('Content-Type: '.(is_string($fixture['response']) ? 'application/octet-stream' : 'application/json'));
foreach ($fixture['responseHeaders'] ?? [] as $name => $value) {
    header($name.': '.$value);
}
header('X-Request-Id: native_request');
echo is_string($fixture['response']) ? $fixture['response'] : json_encode($fixture['response'], JSON_THROW_ON_ERROR);
