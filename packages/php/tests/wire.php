<?php

declare(strict_types=1);

$root = dirname(__DIR__, 3);
$fixtures = json_decode(file_get_contents($root . '/contracts/fixtures/behavior.json'), true, flags: JSON_THROW_ON_ERROR);
$server = proc_open(['node', $root . '/scripts/sdk-fixture-server.mjs', '--port', '0'], [0 => ['pipe', 'r'], 1 => ['pipe', 'w'], 2 => ['pipe', 'w']], $pipes);
if (!is_resource($server)) {
    throw new RuntimeException('Could not start shared fixture server.');
}
$url = json_decode(fgets($pipes[1]), true, flags: JSON_THROW_ON_ERROR)['url'];
$admin = new GuzzleHttp\Client(['http_errors' => false]);
try {
    foreach ($fixtures['scenarios'] as $scenario) {
        $request = $scenario['request'];
        $outcome = $scenario['outcome'];
        $id = $scenario['id'];
        $admin->post($url . '/__fixtures/' . $id . '/reset');
        $options = new Polymorfa\RequestOptions(
            timeout: ($outcome['timeoutMs'] ?? 30000) / 1000,
            maxNetworkRetries: $outcome['maxNetworkRetries'] ?? null,
            apiVersion: $request['headers']['polymorfa-version'] ?? null,
            idempotencyKey: $request['headers']['idempotency-key'] ?? null,
            headers: ['x-polymorfa-fixture' => $id],
            cancellation: isset($outcome['cancelAfterMs']) ? Polymorfa\CancellationToken::after($outcome['cancelAfterMs'] / 1000) : null,
        );
        $client = new Polymorfa\MessagingClient(Polymorfa\Credential::organizationApiKey($fixtures['organizationCredential']), baseUrl: $url);
        $run = static function () use ($client, $scenario, $request, $options) {
            if ($scenario['id'] === 'sessions-list') {
                $result = $client->sessions->list($options);
                check($result->data['data'][0]['sessionId'] === 'session_fixture', 'Typed sessions wire response');
                return $result;
            }
            if ($scenario['id'] === 'message-send') {
                $result = $client->messages->send('support', $request['body'], $options);
                check($result->data['data']['id'] === 'msg_fixture', 'Typed send wire response');
                return $result;
            }
            return $client->raw->request($request['method'], $request['path'], $request['query'] ?? [], $request['body'] ?? null, $options);
        };
        if (isset($outcome['error'])) {
            $types = ['server' => Polymorfa\ServerException::class, 'timeout' => Polymorfa\TimeoutException::class,
                'cancelled' => Polymorfa\CancelledException::class, 'validation' => Polymorfa\ValidationException::class,
                'authentication' => Polymorfa\AuthenticationException::class, 'authorization' => Polymorfa\AuthorizationException::class,
                'payment_required' => Polymorfa\PaymentRequiredException::class, 'not_found' => Polymorfa\NotFoundException::class,
                'conflict' => Polymorfa\ConflictException::class, 'rate_limit' => Polymorfa\RateLimitException::class];
            $error = raises($run, $types[$outcome['error']]);
            if (isset($outcome['code'])) {
                check($error->errorCode === $outcome['code'], 'Wire error code');
            }
            if (isset($outcome['operationId'])) {
                check($error->metadata->operationId === $outcome['operationId'], 'Wire admitted operation metadata');
            }
            if (isset($outcome['requestId'])) {
                check($error->requestId === $outcome['requestId'], 'Wire error request ID');
                check($error->metadata->requestId === $outcome['metadataRequestId'], 'Wire error metadata request ID');
            }
        } else {
            $result = $run();
            check($result->metadata->attempts === $outcome['attempts'], 'Wire attempts');
            if (array_key_exists('data', $outcome)) {
                check($result->data === $outcome['data'], 'Wire no-content data');
            }
            check($result->metadata->status === $scenario['responses'][count($scenario['responses']) - 1]['status'], 'Wire status');
        }
        $state = json_decode((string) $admin->get($url . '/__fixtures/' . $id . '/state')->getBody(), true, flags: JSON_THROW_ON_ERROR);
        check($state['attempts'] === $outcome['attempts'], 'Shared server attempts for ' . $id);
        check($state['mismatches'] === [], 'Shared server mismatches for ' . $id . ': ' . json_encode($state['mismatches']));
    }
    echo count($fixtures['scenarios']) . " shared wire scenarios passed.\n";
} finally {
    proc_terminate($server);
    foreach ($pipes as $pipe) {
        fclose($pipe);
    }
    proc_close($server);
}
