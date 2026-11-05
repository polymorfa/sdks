<?php

declare(strict_types=1);
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
header('Content-Type: application/json');
header('X-Request-ID: pagination-wire');
if ($path === '/health') {
    echo '{}';
    return;
}
$state = getenv('POLYMORFA_RAW_PAGINATION_STATE');
$requests = json_decode(file_get_contents($state), true, flags:JSON_THROW_ON_ERROR);
$requests[] = ['path' => $_SERVER['REQUEST_URI'],'method' => $_SERVER['REQUEST_METHOD'],'headers' => array_change_key_case(getallheaders(), CASE_LOWER),'body' => json_decode(file_get_contents('php://input'), true)];
file_put_contents($state, json_encode($requests, JSON_THROW_ON_ERROR));
if (str_ends_with($path, '/array')) {
    echo '[1,2]';
    return;
}
if (str_ends_with($path, '/loop')) {
    echo '{"rows":[1],"resume":"same"}';
    return;
}
$after = $_GET['after'] ?? '';
echo $after === '' ? '{"rows":[1,2],"resume":"second"}' : '{"rows":[3],"resume":null}';
