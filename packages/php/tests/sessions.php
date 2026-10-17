<?php

declare(strict_types=1);

$session = ['sessionId' => 'support','name' => 'support','tenantId' => 'org_1','type' => 'linked_device','testMode' => true,'status' => 'CONNECTED','createdAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:00Z'];
$platform = json_decode(file_get_contents(dirname(__DIR__, 3).'/contracts/fixtures/behavior.json'), true, flags:JSON_THROW_ON_ERROR)['scenarios'][0]['responses'][0]['body'];
$accepted = ['success' => true,'message' => 'Queued','operationId' => 'op_1'];
$cases = [
 ['GET','',null,$platform,fn ($s) => $s->list()],
 ['GET','/support',null,['success' => true,'data' => $session],fn ($s) => $s->retrieve('support')],
 ['PUT','/support',['configuration' => ['set' => ['observation' => ['presenceMode' => 'cache']],'reset' => ['historySync.mode']],'revision' => 1],['success' => true,'data' => $session],fn ($s) => $s->update('support', ['configuration' => ['set' => ['observation' => ['presenceMode' => 'cache']],'reset' => ['historySync.mode']],'revision' => 1])],
 ['DELETE','/support',null,['data' => ['removed' => true,'sessionId' => 'support']],fn ($s) => $s->delete('support')],
 ['POST','/support/start',null,['data' => ['starting' => true,'sessionId' => 'support']],fn ($s) => $s->start('support')],
 ['POST','/support/stop',null,['data' => ['stopping' => true,'sessionId' => 'support']],fn ($s) => $s->stop('support')],
 ['POST','/support/restart',null,$accepted,fn ($s) => $s->restart('support')],
 ['POST','/support/logout',null,$accepted,fn ($s) => $s->logout('support')],
 ['GET','/support/me',null,['success' => true,'data' => ['id' => 'user_1','pushName' => 'Ada','accountType' => 'business_app','phonePlatform' => 'android']],fn ($s) => $s->account('support')],
];
foreach ($cases as [$method,$suffix,$body,$fixture,$invoke]) {
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture)], $history));
    $result = $invoke($client->sessions);
    $request = $history[0]['request'];
    check($request->getMethod() === $method && $request->getUri()->getPath() === '/platform/sessions'.$suffix, 'Session route');
    check(json_decode((string)$request->getBody(), true) === $body, 'Session body');
    check($result->data === $fixture && $result->metadata->requestId === 'req_test', 'Session response and metadata');
    $browser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_local'));
    raises(fn () => $invoke($browser->sessions), Polymorfa\ConfigurationException::class);
}
echo count($cases)." session method fixtures and credential checks passed.\n";
