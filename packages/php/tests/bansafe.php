<?php

declare(strict_types=1);

$vectors = json_decode(file_get_contents(__DIR__.'/fixtures/bansafe.json'), true, flags:JSON_THROW_ON_ERROR);
$safe = $vectors['safe'];
$warmup = $vectors['warmup'];
$insurance = $vectors['insurance'];
$healthBody = $vectors['healthBody'];
$sessionSafe = $vectors['session'];
$health = $healthBody + ['projectId' => 'project_1','integrations' => ['emailConfigured' => true,'webhookConfigured' => false]];
$cases = [
 ['GET','safe-mode',null,$safe,fn ($r) => $r->getProjectSafeMode('project_1'),fn ($r) => $r->getSafeMode('project_1')],
 ['PUT','safe-mode',['presence' => 'dark','onlineStart' => 9],$safe,fn ($r) => $r->updateProjectSafeMode('project_1', ['presence' => 'dark','onlineStart' => 9]),fn ($r) => $r->updateSafeMode('project_1', ['presence' => 'dark','onlineStart' => 9])],
 ['GET','warmup-plan',null,$warmup,fn ($r) => $r->getProjectWarmupPlan('project_1'),fn ($r) => $r->getWarmupPlan('project_1')],
 ['PUT','warmup-plan',['enabled' => true,'warmupDays' => 14,'dailyStart' => 5],$warmup,fn ($r) => $r->updateProjectWarmupPlan('project_1', ['enabled' => true,'warmupDays' => 14,'dailyStart' => 5]),fn ($r) => $r->updateWarmupPlan('project_1', ['enabled' => true,'warmupDays' => 14,'dailyStart' => 5])],
 ['GET','insurance-evidence',null,$insurance,fn ($r) => $r->getProjectInsuranceEvidence('project_1'),fn ($r) => $r->getInsuranceEvidence('project_1')],
 ['PUT','insurance-evidence',['enabled' => false],$insurance,fn ($r) => $r->updateProjectInsuranceEvidence('project_1', ['enabled' => false]),fn ($r) => $r->updateInsuranceEvidence('project_1', ['enabled' => false])],
 ['GET','health-policy',null,$health,fn ($r) => $r->getProjectHealthPolicy('project_1'),fn ($r) => $r->getHealthPolicy('project_1')],
 ['PUT','health-policy',$healthBody,$health,fn ($r) => $r->updateProjectHealthPolicy('project_1', $healthBody),fn ($r) => $r->updateHealthPolicy('project_1', $healthBody)],
];
foreach ($cases as [$method,$setting,$body,$data,$messaging,$platform]) {
    foreach (['messaging','platform'] as $family) {
        $fixture = ['data' => $data] + ($family === 'messaging' ? ['success' => true] : []);
        $history = [];
        $http = mocked([jsonResponse($fixture)], $history);
        $client = $family === 'messaging' ? new Polymorfa\MessagingClient($credential, http:$http) : new Polymorfa\Client($credential, http:$http);
        $result = $family === 'messaging' ? $messaging($client->banSafe) : $platform($client->projects);
        $request = $history[0]['request'];
        check($request->getMethod() === $method && $request->getUri()->getPath() === '/'.$family.'/projects/project_1/'.$setting, 'BanSafe project route');
        check(json_decode((string)$request->getBody(), true) === $body, 'BanSafe project body');
        check($result->data === $fixture && $result->metadata->requestId === 'req_test', 'BanSafe typed result and metadata');
        if ($family === 'messaging') {
            $browser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_fixture'));
            raises(fn () => $messaging($browser->banSafe), Polymorfa\ConfigurationException::class);
        }
    }
}
foreach (['GET','PUT'] as $method) {
    $body = $method === 'PUT' ? ['pacing' => 'inherit'] : null;
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['success' => true,'data' => $sessionSafe])], $history));
    $result = $method === 'GET' ? $client->banSafe->getSessionSafeMode('support') : $client->banSafe->updateSessionSafeMode('support', $body);
    check($history[0]['request']->getMethod() === $method && $history[0]['request']->getUri()->getPath() === '/messaging/support/safe-mode', 'Session Safe Mode route');
    check(json_decode((string)$history[0]['request']->getBody(), true) === $body && $result->data['data'] === $sessionSafe && $result->metadata->requestId === 'req_test', 'Session Safe Mode typed body/result/metadata');
}
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['error' => ['code' => 'state_conflict','message' => 'Read the latest version.']], 409)], $history));
$error = raises(fn () => $client->banSafe->updateProjectHealthPolicy('project_1', $healthBody), Polymorfa\ConflictException::class);
check(count($history) === 1 && $error->errorCode === 'state_conflict' && $error->metadata->requestId === 'req_test', 'Stale health policy conflict preserves metadata');
echo "18 typed Messaging/Platform BanSafe methods and stale version boundaries passed.\n";

foreach (['GET','PUT'] as $method) {
    $body = $method === 'PUT' ? ['pacing' => 'inherit'] : null;
    $fixture = ['data' => $sessionSafe];
    $history = [];
    $client = new Polymorfa\Client($credential, http:mocked([jsonResponse($fixture)], $history));
    $result = $method === 'GET' ? $client->sessions->getSafeMode('support') : $client->sessions->updateSafeMode('support', $body);
    check($history[0]['request']->getMethod() === $method && $history[0]['request']->getUri()->getPath() === '/platform/sessions/support/safe-mode', 'Platform session Safe Mode route');
    check(json_decode((string)$history[0]['request']->getBody(), true) === $body && $result->data === $fixture && $result->metadata->requestId === 'req_test', 'Platform session Safe Mode body/result/metadata');
}
echo "2 Platform session Safe Mode methods passed.\n";
