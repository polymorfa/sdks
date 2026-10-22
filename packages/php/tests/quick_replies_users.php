<?php

declare(strict_types=1);

$body = ['shortcut' => 'hello','message' => 'Hello','keywords' => ['greeting'],'count' => 2];
$reply = ['id' => 'reply_1'] + $body;
$collection = ['policy' => 'cache','status' => 'fresh','observedAt' => '2026-10-11T00:00:00Z','quickReplies' => [$reply + ['associatedLabelIds' => ['label_1'],'observedAt' => '2026-10-11T00:00:00Z']]];
$cases = [
 ['GET','/business/quick-replies',null,$collection,fn ($c) => $c->quickReplies->list('support')],
 ['POST','/business/quick-replies',$body,$reply,fn ($c) => $c->quickReplies->create('support', $body)],
 ['PUT','/business/quick-replies/reply_1',$body,$reply,fn ($c) => $c->quickReplies->replace('support', 'reply_1', $body)],
 ['DELETE','/business/quick-replies/reply_1',null,['id' => 'reply_1','status' => 'DELETED'],fn ($c) => $c->quickReplies->delete('support', 'reply_1')],
 ['GET','/users/user_1/security-code',null,['id' => 'user_1','phoneNumber' => '+15551234567','username' => 'example','numericCode' => str_repeat('0', 60),'qrCode' => 'YWJj'],fn ($c) => $c->users->getSecurityCode('support', 'user_1')],
];
foreach ($cases as [$method,$suffix,$body,$data,$invoke]) {
    $fixture = ['success' => true,'data' => $data];
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture)], $history));
    $response = $invoke($client);
    $request = $history[0]['request'];
    check($request->getMethod() === $method && $request->getUri()->getPath() === '/messaging/support'.$suffix, 'Quick reply/user route');
    check(json_decode((string)$request->getBody(), true) === $body, 'Quick reply/user body');
    check($response->data === $fixture && $response->metadata->requestId === 'req_test', 'Quick reply/user result and metadata');
}
echo count($cases)." typed quick reply and user methods passed.\n";
