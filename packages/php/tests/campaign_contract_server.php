<?php

declare(strict_types=1);

$state = (string) getenv('POLYMORFA_PHP_CONTRACT_STATE');
if ($_SERVER['REQUEST_URI'] === '/__state') {
    header('Content-Type: application/json');
    $saved = json_decode((string) file_get_contents($state), false, flags: JSON_THROW_ON_ERROR);
    echo json_encode($saved->requests ?? [], JSON_THROW_ON_ERROR);
    return;
}
if ($_SERVER['REQUEST_URI'] === '/__case') {
    file_put_contents($state, (string) file_get_contents('php://input'));
    header('Content-Type: application/json');
    echo '{}';
    return;
}
$fixture = json_decode((string) file_get_contents($state), false, flags: JSON_THROW_ON_ERROR);
$headers = array_change_key_case(getallheaders(), CASE_LOWER);
$rawBody = (string) file_get_contents('php://input');
$actual = isset($fixture->bodySha256) ? null : json_decode($rawBody, false);
$expected = $fixture->body ?? null;
$attempt = count($fixture->requests ?? []);
$fixture->requests[] = ['path' => $_SERVER['REQUEST_URI'], 'bodySha256' => hash('sha256', $rawBody), 'idempotencyKey' => $headers['idempotency-key'] ?? null];
file_put_contents($state, json_encode($fixture, JSON_THROW_ON_ERROR));
$failure = $_SERVER['REQUEST_METHOD'] !== $fixture->method
    || $_SERVER['REQUEST_URI'] !== $fixture->path
    || ($headers['polymorfa-version'] ?? '') !== ($fixture->version ?? '2026-10-14')
    || ($headers['authorization'] ?? '') !== $fixture->authorization
    || (isset($fixture->bodySha256) ? hash('sha256', $rawBody) !== $fixture->bodySha256 || strlen($rawBody) > $fixture->maxBodyBytes : !ccWireSame($actual, $expected));
foreach ($fixture->requestHeaders ?? new stdClass() as $name => $value) {
    $failure = $failure || ($headers[strtolower($name)] ?? '') !== $value;
}
if ($failure) {
    http_response_code(422);
    header('Content-Type: application/json');
    echo '{"error":{"code":"wire_mismatch","message":"Native campaign contract differs."}}';
    return;
}
http_response_code($fixture->statuses[$attempt] ?? $fixture->status ?? 200);
header('Content-Type: '.($fixture->contentType ?? 'application/json'));
header('X-Request-Id: campaign_contract_request');
foreach ($fixture->headers ?? new stdClass() as $name => $value) {
    header($name.': '.$value);
}
if (isset($fixture->bodyDelaySeconds)) {
    echo substr($fixture->response, 0, 1);
    if (ob_get_level() > 0) {
        ob_flush();
    }
    flush();
    usleep((int) ($fixture->bodyDelaySeconds * 1000000));
    echo substr($fixture->response, 1);
} else {
    echo $fixture->response;
}


function ccWireSame(mixed $actual, mixed $expected): bool
{
    if (get_debug_type($actual) !== get_debug_type($expected)) {
        return false;
    }
    if ($actual instanceof stdClass && $expected instanceof stdClass) {
        $left = get_object_vars($actual);
        $right = get_object_vars($expected);
        ksort($left);
        ksort($right);
        return ccWireSame($left, $right);
    }
    if (is_array($actual) && is_array($expected)) {
        if (array_keys($actual) !== array_keys($expected)) {
            return false;
        }
        foreach ($actual as $key => $value) {
            if (!ccWireSame($value, $expected[$key])) {
                return false;
            }
        }
        return true;
    }
    return $actual === $expected;
}
