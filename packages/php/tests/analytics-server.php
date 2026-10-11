<?php

declare(strict_types=1);
if ($_SERVER['REQUEST_URI'] === '/ready') {
    echo 'ready';
    return;
}
$accept = $_SERVER['HTTP_ACCEPT'] ?? '';
$project = '11111111-1111-1111-1111-111111111111';
$valid = (($_SERVER['REQUEST_URI'] === '/platform/analytics/metrics?windowHours=24&segments=false&format=prometheus' && $accept === 'text/plain') || ($_SERVER['REQUEST_URI'] === '/platform/projects/'.$project.'/analytics/metrics?format=openmetrics' && $accept === 'application/openmetrics-text')) && ($_SERVER['HTTP_AUTHORIZATION'] ?? '') === 'Bearer pmfa_'.str_repeat('a', 72);
if (!$valid) {
    http_response_code(422);
    header('content-type:application/json');
    echo '{"error":{"code":"wire_mismatch"}}';
    return;
}
header('content-type:'.$accept.'; charset=utf-8');
header('x-request-id:native_request');
echo "# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled 0\n".($accept === 'application/openmetrics-text' ? "# EOF\n" : '');
