<?php

declare(strict_types=1);

// Public HTTP plus response-boundary callbacks establish the exact cancellation handoff.
$ccEmptyToken = new Polymorfa\CancellationToken();
$ccStack = GuzzleHttp\HandlerStack::create();
$ccStack->push(static fn (callable $next): callable => static function ($request, array $options) use ($next, $ccEmptyToken) {
    return $next($request, $options)->then(static function ($response) use ($ccEmptyToken) {
        $response->getBody()->getContents(); // An actual empty HTTP body, now at EOF.
        $ccEmptyToken->cancel();
        return $response;
    });
});
$ccEmptyClient = new Polymorfa\MessagingClient($ccCredential, baseUrl: $ccUrl, http: new GuzzleHttp\Client(['handler' => $ccStack]));
$ccHttp->post($ccUrl.'/__case', ['json' => ['method' => 'GET', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/recipients/export', 'body' => null, 'authorization' => $ccCredential->authorization(), 'contentType' => 'text/csv', 'response' => '']]);
ccThrows(fn () => $ccEmptyClient->campaigns->exportRecipients('slug', $ccCampaign, [], new Polymorfa\RequestOptions(cancellation: $ccEmptyToken)), Polymorfa\CancelledException::class);

$ccEndToken = new Polymorfa\CancellationToken();
$ccEndStack = GuzzleHttp\HandlerStack::create();
$ccEndStack->push(static fn (callable $next): callable => static function ($request, array $options) use ($next, $ccEndToken) {
    return $next($request, $options)->then(static function ($response) use ($ccEndToken) {
        $body = $response->getBody();
        return $response->withBody(GuzzleHttp\Psr7\FnStream::decorate($body, ['eof' => static function () use ($body, $ccEndToken): bool {
            $ended = $body->eof();
            if ($ended) {
                $ccEndToken->cancel();
            }
            return $ended;
        }]));
    });
});
$ccEndClient = new Polymorfa\MessagingClient($ccCredential, baseUrl: $ccUrl, http: new GuzzleHttp\Client(['handler' => $ccEndStack]));
$ccHttp->post($ccUrl.'/__case', ['json' => ['method' => 'GET', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/recipients/export', 'body' => null, 'authorization' => $ccCredential->authorization(), 'contentType' => 'text/csv', 'response' => "phone,status\r\n"]]);
ccThrows(fn () => $ccEndClient->campaigns->exportRecipients('slug', $ccCampaign, [], new Polymorfa\RequestOptions(cancellation: $ccEndToken)), Polymorfa\CancelledException::class);
echo "CSV empty-handoff and EOF cancellation checks passed.\n";

$ccConfigure = static function (array $config) use ($ccHttp, $ccUrl, $ccCredential): void {
    $ccHttp->post($ccUrl.'/__case', ['json' => ['body' => null, 'authorization' => $ccCredential->authorization(), ...$config]]);
};
$ccObservations = static fn (): array => json_decode((string) $ccHttp->get($ccUrl.'/__state')->getBody(), true, flags: JSON_THROW_ON_ERROR);
$ccConfigure(['method' => 'POST', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/test-send', 'body' => $ccSendWire, 'response' => $ccMessagingJson($ccSendData), 'statuses' => [503, 200], 'headers' => ['Retry-After' => '0']]);
$ccRetried = $ccMessaging->campaigns->testSend('slug', $ccCampaign, $ccSendBody, new Polymorfa\RequestOptions(maxNetworkRetries: 1));
$ccAttempts = $ccObservations();
ccCheck(count($ccAttempts) === 2 && $ccRetried->metadata->attempts === 2 && $ccAttempts[0]['idempotencyKey'] !== null && $ccAttempts[0]['idempotencyKey'] === $ccAttempts[1]['idempotencyKey'], 'One generated key survives actual503 retry');
$ccFirstGenerated = $ccAttempts[0]['idempotencyKey'];
$ccConfigure(['method' => 'POST', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/test-send', 'body' => $ccSendWire, 'response' => $ccMessagingJson($ccSendData)]);
$ccMessaging->campaigns->testSend('slug', $ccCampaign, $ccSendBody);
ccCheck($ccObservations()[0]['idempotencyKey'] !== $ccFirstGenerated, 'Independent logical test sends receive independent generated keys');

$ccValue = 'before';
$ccCallerBody = ['sessionId' => $ccSendBody['sessionId'], 'to' => $ccSendBody['to'], 'variables' => ['0' => &$ccValue]];
$ccHeader = 'before';
$ccMutationStack = GuzzleHttp\HandlerStack::create();
$ccMutationStack->push(static function (callable $next) use (&$ccValue, &$ccHeader): callable {
    return static function ($request, array $options) use ($next, &$ccValue, &$ccHeader) {
        return $next($request, $options)->then(static function ($response) use (&$ccValue, &$ccHeader) {
            if ($response->getStatusCode() === 503) {
                $ccValue = 'after';
                $ccHeader = 'after';
            }
            return $response;
        });
    };
});
$ccMutationClient = new Polymorfa\MessagingClient($ccCredential, baseUrl: $ccUrl, http: new GuzzleHttp\Client(['handler' => $ccMutationStack]));
$ccConfigure(['method' => 'POST', 'path' => '/messaging/projects/slug/campaigns/'.$ccCampaign.'/test-send', 'body' => ['sessionId' => $ccSendBody['sessionId'], 'to' => $ccSendBody['to'], 'variables' => (object) ['0' => 'before']], 'response' => $ccMessagingJson($ccSendData), 'statuses' => [503, 200], 'requestHeaders' => ['X-Capture' => 'before', 'Idempotency-Key' => 'retained'], 'headers' => ['Retry-After' => '0']]);
$ccMutationClient->campaigns->testSend('slug', $ccCampaign, $ccCallerBody, new Polymorfa\RequestOptions(maxNetworkRetries: 1, idempotencyKey: 'retained', headers: ['X-Capture' => &$ccHeader]));
$ccAttempts = $ccObservations();
ccCheck($ccValue === 'after' && $ccHeader === 'after' && count($ccAttempts) === 2 && $ccAttempts[0]['bodySha256'] === $ccAttempts[1]['bodySha256'], 'Captured numeric dictionary/body/header values survive caller-reference mutation across503');

$ccQueryProject = $ccProject;
$ccQuery = ['projectId' => &$ccQueryProject];
$ccQueryStack = GuzzleHttp\HandlerStack::create();
$ccQueryStack->push(static function (callable $next) use (&$ccQueryProject, $ccCustomer): callable {
    return static function ($request, array $options) use ($next, &$ccQueryProject, $ccCustomer) {
        return $next($request, $options)->then(static function ($response) use (&$ccQueryProject, $ccCustomer) {
            $ccQueryProject = $ccCustomer;
            return $response;
        });
    };
});
$ccQueryClient = new Polymorfa\Client($ccCredential, baseUrl: $ccUrl, http: new GuzzleHttp\Client(['handler' => $ccQueryStack]));
$ccConfigure(['method' => 'GET', 'path' => '/platform/campaigns/'.$ccCampaign.'/links?projectId='.$ccProject, 'response' => $ccJson($ccLinks), 'statuses' => [503, 200], 'headers' => ['Retry-After' => '0']]);
$ccQueryClient->campaigns->links($ccCampaign, $ccQuery, new Polymorfa\RequestOptions(maxNetworkRetries: 1));
ccCheck($ccQueryProject === $ccCustomer && count($ccObservations()) === 2, 'Flat selected query snapshots survive reference mutation across503');

foreach ([null, new Polymorfa\RequestOptions(idempotencyKey: 'caller-key')] as $ccUnsafeOptions) {
    $ccConfigure(['method' => 'POST', 'path' => '/platform/campaign-reply-flows', 'body' => ['projectId' => $ccProject, ...$ccFlowInput], 'response' => $ccJson($ccFlowData), 'statuses' => [503, 200], 'headers' => ['Retry-After' => '0']]);
    ccThrows(fn () => $ccOrg->campaigns->createReplyFlow(['projectId' => $ccProject, ...$ccFlowInput], $ccUnsafeOptions), Polymorfa\ServerException::class);
    ccCheck(count($ccObservations()) === 1, 'Unsafe default admits one attempt even when caller supplies a key');
}
$ccConfigure(['method' => 'POST', 'path' => '/platform/campaign-reply-flows', 'body' => ['projectId' => $ccProject, ...$ccFlowInput], 'response' => $ccJson($ccFlowData), 'statuses' => [503, 200], 'headers' => ['Retry-After' => '0']]);
$ccOrg->campaigns->createReplyFlow(['projectId' => $ccProject, ...$ccFlowInput], new Polymorfa\RequestOptions(maxNetworkRetries: 1, idempotencyKey: 'explicit-retry'));
ccCheck(count($ccObservations()) === 2, 'Explicit unsafe retry override survives');
foreach ([['X-Polymorfa-Operation-Id' => 'accepted'], ['Idempotent-Replayed' => 'true']] as $ccAdmission) {
    $ccConfigure(['method' => 'GET', 'path' => '/platform/campaign-settings', 'response' => '{"error":{"code":"result_unknown","param":"revision"}}', 'statuses' => [503, 200], 'headers' => ['Retry-After' => '0', ...$ccAdmission]]);
    ccThrows(fn () => $ccOrg->campaigns->getSettings(new Polymorfa\RequestOptions(maxNetworkRetries: 1)), Polymorfa\ServerException::class);
    ccCheck(count($ccObservations()) === 1, 'Admitted/replayed outcomes are never automatically replaced');
}

foreach ([400, 401, 402, 403, 404, 409, 413, 422, 429, 500, 599] as $ccStatus) {
    $ccConfigure(['method' => 'GET', 'path' => '/platform/campaign-settings', 'response' => '{"error":{"code":"future_campaign_code","message":"Denied","param":"body.revision","request_id":"body_request"}}', 'status' => $ccStatus, 'headers' => ['X-Trace-Id' => 'trace', 'Idempotent-Replayed' => 'true', 'Content-Disposition' => 'attachment', 'Set-Cookie' => 'never-export']]);
    $ccError = ccThrows(fn () => $ccOrg->campaigns->getSettings(new Polymorfa\RequestOptions(maxNetworkRetries: 0)), Polymorfa\PolymorfaException::class);
    ccCheck($ccError->errorCode === 'future_campaign_code' && $ccError->param === 'body.revision' && $ccError->requestId === 'body_request' && $ccError->status === $ccStatus && $ccError->metadata->headers['x-trace-id'] === 'trace' && $ccError->metadata->headers['idempotent-replayed'] === 'true' && $ccError->metadata->headers['content-disposition'] === 'attachment' && !isset($ccError->metadata->headers['set-cookie']), 'Error param and safe metadata survive HTTP'.$ccStatus);
}
foreach (['campaign_approval_required', 'campaign_approval_stale', 'campaign_variables_missing', 'zero_knowledge_session'] as $ccCode) {
    ccCheck(Polymorfa\ErrorCodes::isKnown($ccCode), 'Known additive API code');
}
echo "Native retry capture, unsafe admission and structured error metadata checks passed.\n";
