<?php

declare(strict_types=1);

$rules = ['recipientMode' => 'conversation','allowedActions' => 'send_message,read_presence','rateLimit' => 60,'maxDaily' => 0,'allowedOrigins' => 'https://example.com','conversationTtlSeconds' => 86400,'maxConcurrency' => 2,'maxSetupsPerMinute' => 10,'allowedNumber' => '', 'enabled' => true];
$token = ['success' => true, 'data' => ['token' => 'pmfa_ct_fixture','expiresAt' => '2026-10-11T12:00:00Z']];
$cases = [
 ['POST','/platform/client-tokens',['ephemeralId' => 'browser_1','session' => 'support','ttlSeconds' => 600],$token,fn ($r) => $r->mint(['ephemeralId' => 'browser_1','session' => 'support','ttlSeconds' => 600])],
 ['POST','/platform/client-tokens',['ephemeralId' => 'browser_1','customer' => 'cust_1','allow' => ['send_message']],$token,fn ($r) => $r->mint(['ephemeralId' => 'browser_1','customer' => 'cust_1','allow' => ['send_message']])],
 ['GET','/platform/sessions/support/client-rules',null,['success' => true,'data' => $rules],fn ($r) => $r->retrieveRules('support')],
 ['PUT','/platform/sessions/support/client-rules',['recipientMode' => 'none','enabled' => false],['success' => true],fn ($r) => $r->updateRules('support', ['recipientMode' => 'none','enabled' => false])],
 ['DELETE','/platform/sessions/support/client-rules',null,['success' => true],fn ($r) => $r->deleteRules('support')],
];
foreach ($cases as [$method,$path,$body,$fixture,$invoke]) {
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture)], $history));
    $result = $invoke($client->clientTokens);
    $request = $history[0]['request'];
    check($request->getMethod() === $method && $request->getUri()->getPath() === $path, 'Client token route');
    check(json_decode((string)$request->getBody(), true) === $body, 'Client token body');
    check($result->data === $fixture && $result->metadata->requestId === 'req_test', 'Token response and metadata');
    $browser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_fixture'));
    raises(fn () => $invoke($browser->clientTokens), Polymorfa\ConfigurationException::class);
}
$client = new Polymorfa\MessagingClient($credential);
foreach ([['ephemeralId' => 'browser_1'], ['ephemeralId' => 'browser_1','session' => 'support','customer' => 'cust_1'], ['ephemeralId' => 'browser_1','session' => 'support','allow' => []]] as $bad) {
    raises(fn () => $client->clientTokens->mint($bad), Polymorfa\ConfigurationException::class);
}
echo count($cases)." client token fixtures and principal/target guards passed.\n";
