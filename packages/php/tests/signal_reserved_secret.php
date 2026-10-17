<?php

declare(strict_types=1);

use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use Polymorfa\{ConfigurationException,SignalSidecarClient,SignalSidecarException,SignalWebhooks,WebhookSignatureException};

// Synthetic values shaped like Polymorfa credentials. None is a real secret.
$reservedSignalSecrets = [
    'pmfa_'.str_repeat('A', 72),
    'pmfa_pt_'.str_repeat('B', 93).'A',
    'pmfa_ct_synthetic-client-token-value',
    'pmfa_ls_synthetic-link-session-value',
    'pmfa_at_synthetic-special-purpose-value',
    'pmfa_wst_synthetic-socket-ticket-value',
    'pmfa_sd_synthetic-session-device-value',
    'pmfa_independent_looking_but_reserved',
];
$signalHistory = [];
$signalStack = HandlerStack::create(new MockHandler([new Response(503), new Response(503)]));
$signalStack->push(Middleware::history($signalHistory));
$signalHttp = new GuzzleHttp\Client(['handler' => $signalStack]);
foreach ($reservedSignalSecrets as $reserved) {
    $error = raises(fn () => new SignalSidecarClient('http://127.0.0.1:9', $reserved, $signalHttp), ConfigurationException::class);
    check(!str_contains($error->getMessage(), $reserved), 'Reserved Signal secret is not echoed');
}
check($signalHistory === [], 'Reserved Signal secret configuration sends no request');
$independent = new SignalSidecarClient('http://127.0.0.1:9', 'synthetic-independent-application-secret', $signalHttp);
raises(fn () => $independent->sessions(), SignalSidecarException::class);
check(count($signalHistory) === 1 && $signalHistory[0]['request']->getHeaderLine('Authorization') === 'Bearer synthetic-independent-application-secret', 'Independent Signal secret is sent as the application bearer');

$signalVector = json_decode(file_get_contents(__DIR__.'/fixtures/signal-sidecar.json'), true, flags:JSON_THROW_ON_ERROR);
foreach ([...$reservedSignalSecrets, $signalVector['secret']] as $key) {
    $signature = 'v1='.hash_hmac('sha256', $signalVector['timestamp'].'.'.$signalVector['rawBody'], $key);
    $verify = fn () => SignalWebhooks::constructEvent($signalVector['rawBody'], $signature, $signalVector['timestamp'], $signalVector['eventId'], $key, nowUnixSeconds:(int) $signalVector['timestamp']);
    if ($key === $signalVector['secret']) {
        check($signature === $signalVector['signature'] && $verify()->id === $signalVector['eventId'], 'Independent Signal webhook key exact HMAC control');
        continue;
    }
    $error = raises($verify, WebhookSignatureException::class);
    check($error->errorCode === 'invalid_signal_webhook_signature' && !str_contains($error->getMessage(), $key), 'Reserved Signal webhook key rejected before authentication');
}
echo "Reserved Polymorfa prefixes rejected as Signal application and webhook secrets; independent controls passed.\n";
