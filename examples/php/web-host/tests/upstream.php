<?php

$state = getenv('EXAMPLE_STATE_DIR').'/native-mints';
header('Content-Type: application/json');
if ($_SERVER['REQUEST_URI'] === '/__state') {
    echo json_encode(['mints' => is_file($state) ? (int)file_get_contents($state) : 0]);
    return;
}
$body = json_decode(file_get_contents('php://input'), true);
if ($_SERVER['REQUEST_URI'] === '/messaging/quicklinks') {
    if ($_SERVER['REQUEST_METHOD'] !== 'POST' || ($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer pmfa_pt_'.str_repeat('a', 93).'A' || ($_SERVER['HTTP_POLYMORFA_VERSION'] ?? '') !== '2026-09-22' || $body !== ['purpose' => 'add_connection','session' => 'authorized-support','addConnection' => 'linked_devices','connectionGoal' => 'hybrid']) { http_response_code(422); echo '{"error":"fixture_mismatch"}'; return; }
    $links = getenv('EXAMPLE_STATE_DIR').'/native-links';
    file_put_contents($links, (string)((is_file($links) ? (int)file_get_contents($links) : 0) + 1), LOCK_EX);
    echo json_encode(['success' => true,'data' => ['purpose' => 'add_connection','session' => 'authorized-support','addConnection' => 'linked_devices','connectionGoal' => 'hybrid','id' => 'link','url' => 'https://quick.example.test/link','expiresAt' => null]]); return;
}

if ($_SERVER['REQUEST_METHOD'] !== 'POST' || $_SERVER['REQUEST_URI'] !== '/platform/client-tokens' || ($_SERVER['HTTP_AUTHORIZATION'] ?? '') !== 'Bearer pmfa_pt_'.str_repeat('a', 93).'A' || ($_SERVER['HTTP_POLYMORFA_VERSION'] ?? '') !== '2026-09-22' || $body !== ['ephemeralId' => 'example:local-app-user','session' => 'authorized-support','ttlSeconds' => 600]) {
    http_response_code(422);
    echo '{"error":"fixture_mismatch"}';
    return;
}
file_put_contents($state, (string)((is_file($state) ? (int)file_get_contents($state) : 0) + 1), LOCK_EX);
echo json_encode(['success' => true,'data' => ['token' => 'pmfa_ct_browser_fixture','expiresAt' => gmdate('c', time() + 600)]]);
