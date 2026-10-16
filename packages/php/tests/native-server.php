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
// Preserve producer object/list kinds instead of re-encoding empty objects as lists.
$fixture['response'] = json_decode(file_get_contents($state), false, flags: JSON_THROW_ON_ERROR)->response;
$actual = json_decode(file_get_contents('php://input'), true);
$failure = $_SERVER['REQUEST_METHOD'] !== $fixture['method'] || !in_array($_SERVER['REQUEST_URI'], $fixture['allowedPaths'] ?? [$fixture['path']], true) || $actual !== $fixture['body'];
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$failure = $failure || ($headers['authorization'] ?? '') !== $fixture['authorization'] || ($headers['polymorfa-version'] ?? '') !== '2026-09-22';
foreach ($fixture['requestHeaders'] ?? [] as $name => $value) {
    $failure = $failure || ($headers[strtolower($name)] ?? '') !== $value;
}
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
$wire = is_string($fixture['response']) ? $fixture['response'] : json_encode($fixture['response'], JSON_THROW_ON_ERROR);
if (isset($fixture['bodyDelaySeconds'])) {
    $fixture['wireAttempt'] = ($fixture['wireAttempt'] ?? 0) + 1;
    file_put_contents($state, json_encode($fixture, JSON_THROW_ON_ERROR));
    if ($fixture['wireAttempt'] === 1 && isset($fixture['firstResponseDelaySeconds'])) {
        usleep((int) ($fixture['firstResponseDelaySeconds'] * 1000000));
    }
    if ($fixture['wireAttempt'] >= ($fixture['delayOnAttempt'] ?? 1)) {
        echo substr($wire, 0, 1);
        ob_flush();
        flush();
        usleep((int)($fixture['bodyDelaySeconds'] * 1000000));
        echo substr($wire, 1);
        return;
    }
}
echo $wire;
