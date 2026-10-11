<?php

declare(strict_types=1);

require dirname(__DIR__) . '/vendor/autoload.php';

use GuzzleHttp\Client as HttpClient;
use GuzzleHttp\Handler\MockHandler;
use GuzzleHttp\HandlerStack;
use GuzzleHttp\Middleware;
use GuzzleHttp\Psr7\Response;
use Polymorfa\{Client, Credential, MessagingClient, RequestOptions, ConfigurationException,
    ServerException, AuthenticationException, CancellationToken, CancelledException, Webhooks, WebhookSignatureException};

function check(bool $value, string $message): void
{
    if (!$value) {
        throw new RuntimeException($message);
    }
}
function raises(callable $run, string $type): Throwable
{
    try {
        $run();
    } catch (Throwable $error) {
        check($error instanceof $type, 'Expected ' . $type . ', got ' . $error::class);
        return $error;
    }
    throw new RuntimeException('Expected exception: ' . $type);
}
function jsonResponse(array $data, int $status = 200, array $headers = []): Response
{
    return new Response($status, $headers + ['content-type' => 'application/json', 'x-request-id' => 'req_test'], json_encode($data, JSON_THROW_ON_ERROR));
}
function mocked(array $responses, array &$history): HttpClient
{
    $stack = HandlerStack::create(new MockHandler($responses));
    $stack->push(Middleware::history($history));
    return new HttpClient(['handler' => $stack]);
}

$credential = Credential::organizationApiKey('pmfa_' . str_repeat('a', 72));
foreach (['pt', 'ct', 'ls', 'at', 'wst', 'sd'] as $prefix) {
    raises(fn () => Credential::organizationApiKey('pmfa_' . $prefix . '_' . str_repeat('a', 72 - strlen($prefix) - 1)), ConfigurationException::class);
}
check(!str_contains(var_export($credential->__debugInfo(), true), str_repeat('a', 72)), 'Credential redaction');
$receipt = ['success' => true, 'data' => ['id' => 'msg_1', 'whatsapp_ids' => ['linked_devices' => 'provider_1'],
    'conversation' => ['id' => 'user_1'], 'timestamp' => '2026-09-22T00:00:00Z', 'status' => 'sent', 'type' => 'text']];
$link = ['success' => true, 'data' => ['id' => 'link_1', 'url' => 'https://link.polymorfa.com/link_1', 'session' => 'support',
    'purpose' => 'initial', 'connectionGoal' => 'single', 'expiresAt' => null]];
$hook = ['success' => true, 'data' => ['id' => 'hook_1', 'tenantId' => 'org_1', 'url' => 'https://example.com/hook', 'events' => ['message.received'],
    'retries' => ['attempts' => 1, 'delaySeconds' => 1, 'policy' => 'constant'], 'headers' => [], 'enabled' => true, 'createdAt' => '2026-09-22T00:00:00Z']];
$cases = [
    ['POST', '/messaging/support/messages/send', ['conversation' => ['phoneNumber' => '+15551234567'], 'content' => ['text' => 'Hello']], $receipt,
        fn ($c) => $c->messages->send('support', ['conversation' => ['phoneNumber' => '+15551234567'], 'content' => ['text' => 'Hello']], new RequestOptions(idempotencyKey: 'send_1'))],
    ['POST', '/messaging/support/messages/react', ['conversation' => ['id' => 'user_1'], 'id' => 'msg_1', 'reaction' => '👍'], $receipt,
        fn ($c) => $c->messages->react('support', ['conversation' => ['id' => 'user_1'], 'id' => 'msg_1', 'reaction' => '👍'])],
    ['POST', '/messaging/support/messages/seen', ['conversation' => ['id' => 'user_1'], 'id' => 'msg_1'], ['success' => true,'data' => ['status' => 'OK']],
        fn ($c) => $c->messages->markSeen('support', ['conversation' => ['id' => 'user_1'], 'id' => 'msg_1'])],
    ['POST', '/messaging/support/messages/typing', ['conversation' => ['id' => 'user_1'], 'state' => 'typing'], ['success' => true,'data' => ['status' => 'OK']],
        fn ($c) => $c->messages->setTyping('support', ['conversation' => ['id' => 'user_1'], 'state' => 'typing'])],
    ['POST', '/messaging/support/messages/star', ['conversation' => ['id' => 'user_1'], 'id' => 'msg_1', 'star' => true], ['success' => true,'data' => ['status' => 'OK']],
        fn ($c) => $c->messages->star('support', ['conversation' => ['id' => 'user_1'], 'id' => 'msg_1', 'star' => true])],
    ['GET', '/messaging/support/operations/op_1', null, ['success' => true, 'data' => ['operationId' => 'op_1', 'status' => 'pending']], fn ($c) => $c->messages->operationStatus('support', 'op_1')],
    ['GET', '/messaging/support/pair/qr?format=json', null, ['success' => true, 'data' => ['qr' => 'qr_1']], fn ($c) => $c->sessions->qr('support')],
    ['POST', '/messaging/support/pair/code', ['phone' => '+15551234567'], ['success' => true, 'data' => ['code' => '123']], fn ($c) => $c->sessions->requestPairingCode('support', ['phone' => '+15551234567'])],
    ['POST', '/messaging/quicklinks', ['projectId' => 'project_1'], $link, fn ($c) => $c->quickLinks->create(['projectId' => 'project_1'])],
    ['GET', '/messaging/quicklinks/link_1', null, ['success' => true, 'data' => ['id' => 'link_1', 'status' => 'pending', 'session' => 'support', 'purpose' => 'initial', 'connectionGoal' => 'single', 'hybridPhase' => null,
        'expiresAt' => null, 'openedAt' => null, 'connectedAt' => null, 'phone' => null, 'errorCode' => null]], fn ($c) => $c->quickLinks->retrieve('link_1')],
    ['DELETE', '/messaging/quicklinks/link_1', null, ['success' => true, 'message' => 'Cancelled'], fn ($c) => $c->quickLinks->cancel('link_1')],
    ['POST', '/messaging/webhooks', ['url' => 'https://example.com/hook'], $hook, fn ($c) => $c->webhooks->create(['url' => 'https://example.com/hook'])],
    ['GET', '/messaging/webhooks/hook_1', null, $hook, fn ($c) => $c->webhooks->retrieve('hook_1')],
    ['PUT', '/messaging/webhooks/hook_1', ['enabled' => false], $hook, fn ($c) => $c->webhooks->update('hook_1', ['enabled' => false])],
    ['DELETE', '/messaging/webhooks/hook_1', null, ['success' => true], fn ($c) => $c->webhooks->delete('hook_1')],
];
foreach ($cases as [$method, $path, $body, $fixture, $invoke]) {
    $history = [];
    $client = new MessagingClient($credential, http: mocked([jsonResponse($fixture)], $history));
    $result = $invoke($client);
    $request = $history[0]['request'];
    check($request->getMethod() === $method, 'Request method');
    check($request->getUri()->getPath() . ($request->getUri()->getQuery() === '' ? '' : '?' . $request->getUri()->getQuery()) === $path, 'Request path');
    check(json_decode((string) $request->getBody(), true) === $body, 'Request body');
    check($request->getHeaderLine('Authorization') === $credential->authorization(), 'Authorization header');
    check($request->getHeaderLine('Polymorfa-Version') === '2026-09-22', 'API version');
    check($result->data === $fixture, 'Typed response fixture');
    check($result->metadata->requestId === 'req_test' && $result->metadata->status === 200, 'Response metadata');
}
$history = [];
$client = new MessagingClient($credential, http: mocked([jsonResponse(['error' => ['code' => 'service_unavailable']], 503, ['retry-after' => '0']), jsonResponse(['data' => []])], $history));
check($client->sessions->list()->metadata->attempts === 2, 'Safe retry');
$history = [];
$client = new MessagingClient($credential, http: mocked([jsonResponse(['error' => ['code' => 'service_unavailable']], 503)], $history));
raises(fn () => $client->quickLinks->create(), ServerException::class);
check(count($history) === 1, 'Unsafe no retry');
$history = [];
$client = new MessagingClient($credential, http: mocked([jsonResponse(['error' => ['code' => 'service_unavailable']], 503, ['idempotent-replayed' => 'true'])], $history));
raises(fn () => $client->messages->send('support', ['conversation' => ['id' => 'user_1'], 'content' => ['text' => 'Hello']]), ServerException::class);
check(count($history) === 1, 'Replayed result final');
$history = [];
$client = new MessagingClient($credential, maxNetworkRetries: 0, http: mocked([jsonResponse(['error' => ['code' => 'invalid_credential', 'message' => 'Expired', 'request_id' => 'body_req']], 401)], $history));
$error = raises(fn () => $client->sessions->list(), AuthenticationException::class);
check($error->requestId === 'body_req', 'Body request ID');
$token = new CancellationToken();
$token->cancel();
raises(fn () => $client->sessions->list(new RequestOptions(cancellation: $token)), CancelledException::class);
$history = [];
$client = new Client($credential, http: mocked([jsonResponse(['data' => [['id' => 'event_1']], 'page' => ['nextCursor' => 'next']]), jsonResponse(['data' => [['id' => 'event_2']], 'page' => ['nextCursor' => null]])], $history));
check(array_column(iterator_to_array($client->events->list()), 'id') === ['event_1', 'event_2'], 'Pagination');
$project = $client->project('project_1');
raises(fn () => $project->project('project_2'), ConfigurationException::class);
foreach (['/../events', '/%2e%2e/events', '//other-host', '/platform/projects/project_2/events'] as $path) {
    raises(fn () => $project->raw->request('GET', $path), Polymorfa\ValidationException::class);
}
$raw = '{"id":"event_1","session":"","timestamp":"2026-10-11T00:00:00Z","event":"future.event","payload":{"x":1}}';
$signature = hash_hmac('sha256', $raw, 'secret');
$event = Webhooks::constructEvent($raw, 'sha256=' . $signature, 'secret');
check(!$event->known && $event->payload === ['x' => 1], 'Unknown webhook event');
check(!Webhooks::verifySignature($raw . ' ', $signature, 'secret'), 'Exact bytes');
raises(fn () => Webhooks::constructEvent('invalid JSON', $signature, 'secret'), WebhookSignatureException::class);
echo count($cases) . " typed operation fixtures and client behavior checks passed.\n";
require __DIR__ . '/wire.php';
require __DIR__ . '/native.php';
require __DIR__ . '/accounts.php';
require __DIR__ . '/contacts.php';
require __DIR__ . '/media.php';
require __DIR__ . '/groups.php';
require __DIR__ . '/sessions.php';
require __DIR__ . '/integrations_calls.php';

require __DIR__."/client_tokens.php";

require __DIR__."/chats.php";

require __DIR__."/business.php";

require __DIR__."/business_catalog.php";

require __DIR__."/quick_replies_users.php";

require __DIR__."/cloud_sessions.php";

require __DIR__."/channels.php";

require __DIR__."/voip.php";

require __DIR__."/bansafe.php";

require __DIR__.'/platform_sessions.php';

require __DIR__.'/security.php';

require __DIR__.'/billing.php';

require __DIR__.'/usage.php';

require __DIR__.'/customers.php';

require __DIR__.'/sip.php';

require __DIR__.'/settings.php';

require __DIR__.'/functions.php';

require __DIR__.'/developer.php';

require __DIR__.'/request_logs.php';

require __DIR__.'/official_groups.php';

require __DIR__.'/onboarding.php';

require __DIR__.'/templates.php';

require __DIR__.'/campaigns.php';
require __DIR__.'/audiences.php';

require __DIR__.'/messaging_complete.php';

require __DIR__.'/media_stream.php';

require __DIR__.'/platform_bansafe.php';
require __DIR__.'/flows.php';
require __DIR__.'/voice.php';

require __DIR__.'/event_stream.php';

require __DIR__.'/analytics.php';
require __DIR__.'/call-records.php';
require __DIR__.'/call-consent.php';

require __DIR__.'/graph.php';

require __DIR__.'/webhook_models.php';
