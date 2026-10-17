<?php

declare(strict_types=1);

$vectors = json_decode(file_get_contents(__DIR__.'/fixtures/calls.json'), true, flags:JSON_THROW_ON_ERROR);
$permission = $vectors['permission'];
$settings = $vectors['settings'];
$quality = $vectors['quality'];
$ok = ['success' => true];
$cases = [
 ['POST','/messaging/voip/calls',['session' => 'support','to' => '+15551234567','participant' => 'agent_1','video' => true],['success' => true,'data' => ['callId' => 'call_1','session' => 'support','video' => true]],false,fn ($r) => $r->place(['session' => 'support','to' => '+15551234567','participant' => 'agent_1','video' => true])],
 ['POST','/messaging/voip/calls/call_1/accept',['exclusive' => true,'participant' => 'agent_1'],['success' => true,'data' => ['answered' => true,'answeredBy' => 'server:agent_1','exclusive' => true]],false,fn ($r) => $r->accept('call_1', ['exclusive' => true,'participant' => 'agent_1'])],
 ['POST','/messaging/voip/calls/call_1/reject',null,$ok,false,fn ($r) => $r->reject('call_1')],
 ['POST','/messaging/voip/calls/call_1/leave',['connectionId' => 'connection_1','participant' => 'agent_1'],$ok,false,fn ($r) => $r->leave('call_1', 'connection_1', 'agent_1')],
 ['DELETE','/messaging/voip/calls/call_1',null,$ok,false,fn ($r) => $r->end('call_1')],
 ['POST','/messaging/voip/calls/call_1/participants',['to' => '+15551234567'],['success' => true,'data' => ['id' => 'user_1','phoneNumber' => '+15551234567','audioMuted' => false,'video' => true,'state' => 'invited','handRaised' => false]],false,fn ($r) => $r->addParticipant('call_1', '+15551234567')],
 ['POST','/messaging/voip/calls/call_1/participants/ring',['to' => '+15551234567'],$ok,false,fn ($r) => $r->ringParticipant('call_1', '+15551234567')],
 ['GET','/messaging/support/call-permissions/user_1',null,['success' => true,'data' => $permission + ['conversation' => ['id' => 'user_1']]],true,fn ($r) => $r->retrieveCallPermission('support', 'user_1')],
 ['GET','/platform/sessions/support/call-settings',null,['success' => true,'data' => $settings],true,fn ($r) => $r->retrieveCallSettings('support')],
 ['PUT','/platform/sessions/support/call-settings',['conferenceMode' => false,'expectedRevision' => 1],['success' => true,'data' => array_replace($settings, ['conferenceMode' => false,'revision' => 2])],true,fn ($r) => $r->updateCallSettings('support', ['conferenceMode' => false,'expectedRevision' => 1])],
 ['POST','/messaging/voip/call-links',['session' => 'support','video' => true],['success' => true,'data' => ['session' => 'support','video' => true,'token' => 'link_fixture','url' => 'https://call.whatsapp.com/fixture']],true,fn ($r) => $r->createCallLink(['session' => 'support','video' => true])],
 ['POST','/messaging/voip/call-links/preview',['session' => 'support','video' => true,'token' => 'link_fixture'],['success' => true,'data' => ['session' => 'support','video' => true,'creator' => ['id' => 'user_1'],'approvalRequired' => true,'isAdmin' => false]],true,fn ($r) => $r->previewCallLink(['session' => 'support','video' => true,'token' => 'link_fixture'])],
 ['POST','/messaging/voip/calls/check',['session' => 'support','to' => '+15551234567'],['success' => true,'data' => ['allowed' => true,'refusal' => null,'permission' => $permission]],true,fn ($r) => $r->check(['session' => 'support','to' => '+15551234567'])],
 ['POST','/messaging/voip/calls/call_1/reaction',['connectionId' => 'connection_1','participant' => 'agent_1','emoji' => '👍'],$ok,false,fn ($r) => $r->sendReaction('call_1', ['connectionId' => 'connection_1','participant' => 'agent_1','emoji' => '👍'])],
 ['POST','/messaging/voip/calls/call_1/hand',['connectionId' => 'connection_1','raised' => true],$ok,false,fn ($r) => $r->setHandRaised('call_1', ['connectionId' => 'connection_1','raised' => true])],
 ['POST','/messaging/voip/calls/call_1/reports',$quality,$ok,false,fn ($r) => $r->report('call_1', $quality)],
 ['POST','/messaging/voip/calls/call_1/reports',['kind' => 'error','connectionId' => 'connection_1','error' => ['code' => 'ice_failed']],$ok,false,fn ($r) => $r->report('call_1', ['kind' => 'error','connectionId' => 'connection_1','error' => ['code' => 'ice_failed']])],
];
foreach ($cases as [$method,$path,$body,$fixture,$server,$invoke]) {
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture)], $history));
    $result = $invoke($client->voip);
    $request = $history[0]['request'];
    check($request->getMethod() === $method && $request->getUri()->getPath() === $path, 'Calls route');
    check(json_decode((string)$request->getBody(), true) === $body, 'Calls body');
    check($result->data === $fixture && $result->metadata->requestId === 'req_test', 'Calls typed result and metadata');
    if ($server) {
        $browser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_fixture'));
        raises(fn () => $invoke($browser->voip), Polymorfa\ConfigurationException::class);
    }
}
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([], $history));
foreach ([fn () => $client->voip->createCallLink(['session' => 'support'], new Polymorfa\RequestOptions(idempotencyKey:'bad')),fn () => $client->voip->previewCallLink(['session' => 'support','token' => '?bad']),fn () => $client->voip->updateCallSettings('support', ['expectedRevision' => 1]),fn () => $client->voip->report('call_1', ['kind' => 'quality','connectionId' => 'connection_1','quality' => []]),fn () => $client->voip->report('call_1', ['kind' => 'quality','connectionId' => 'connection_1','quality' => ['rttMs' => 60001]]),fn () => $client->voip->setHandRaised('call_1', ['connectionId' => 'short','raised' => true])] as $invalid) {
    raises($invalid, Polymorfa\ValidationException::class);
}
check($history === [], 'Call guards before transport');
foreach ([fn ($r) => $r->createCallLink(['session' => 'support']),fn ($r) => $r->sendReaction('call_1', ['connectionId' => 'connection_1','emoji' => '👍'], new Polymorfa\RequestOptions(idempotencyKey:'key', maxNetworkRetries:3)),fn ($r) => $r->setHandRaised('call_1', ['connectionId' => 'connection_1','raised' => true], new Polymorfa\RequestOptions(idempotencyKey:'key', maxNetworkRetries:3))] as $invoke) {
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['error' => ['code' => 'service_unavailable']], 503)], $history));
    raises(fn () => $invoke($client->voip), Polymorfa\ServerException::class);
    check(count($history) === 1, 'Call link and reaction/hand never retry');
}
$browser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_fixture'));
raises(fn () => $browser->voip->accept('call_1', ['participant' => 'agent_1']), Polymorfa\ConfigurationException::class);
echo count($cases)." typed Calls REST fixtures and validation/retry boundaries passed.\n";
