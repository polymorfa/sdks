<?php

declare(strict_types=1);

$health = ['status' => 'action_required','checkedAt' => '2026-10-11T00:00:00Z','nextCheckAt' => null,'token' => ['status' => 'expired','expiresAt' => '2026-10-10T00:00:00Z'],'missingPermissions' => ['whatsapp_business_management'],'phoneRegistration' => 'unknown','webhookSubscription' => 'subscribed','failureCode' => 'token_expired'];
$pricing = ['source' => 'meta','since' => '2026-10-01T00:00:00Z','until' => '2026-10-11T00:00:00Z','messages' => 2,'groups' => [['category' => 'service','pricingModel' => 'CBP','pricingType' => null,'billable' => null,'messages' => 2]]];
$reauth = ['quicklinkId' => 'link_1','url' => 'https://link.polymorfa.com/fixture','session' => 'support'];
$cases = [
 ['GET','/meta-pricing',['since' => $pricing['since'],'until' => $pricing['until']],$pricing,fn ($r) => $r->getMetaPricing('support', ['since' => $pricing['since'],'until' => $pricing['until']])],
 ['GET','/cloud-credentials',[],$health,fn ($r) => $r->getCloudCredentialHealth('support')],
 ['POST','/cloud-credentials/reauthorize',[],$reauth,fn ($r) => $r->reauthorizeCloudCredentials('support')],
];
foreach ($cases as [$method,$suffix,$query,$data,$invoke]) {
    $fixture = ['success' => true,'data' => $data];
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture)], $history));
    $response = $invoke($client->sessions);
    $request = $history[0]['request'];
    parse_str($request->getUri()->getQuery(), $actual);
    check($request->getMethod() === $method && $request->getUri()->getPath() === '/messaging/support'.$suffix, 'Cloud session route');
    check($actual === $query && (string)$request->getBody() === '', 'Cloud session query and body');
    check($response->data === $fixture && $response->metadata->requestId === 'req_test', 'Cloud session result and metadata');
    $browser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_fixture'));
    raises(fn () => $invoke($browser->sessions), Polymorfa\ConfigurationException::class);
}
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['error' => ['code' => 'service_unavailable']], 503)], $history));
raises(fn () => $client->sessions->reauthorizeCloudCredentials('support', new Polymorfa\RequestOptions(idempotencyKey:'reauth_1', maxNetworkRetries:3)), Polymorfa\ServerException::class);
check(count($history) === 1, 'Reauthorization never retries');
echo count($cases)." typed Cloud session methods and no-retry reauthorization passed.\n";
