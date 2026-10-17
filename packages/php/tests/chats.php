<?php

declare(strict_types=1);

$summary = ['id' => 'msg_1','whatsapp_ids' => ['official_api' => 'wamid_1'],'direction' => 'inbound','type' => 'image','timestamp' => '2026-10-11T00:00:00Z'];
$message = $summary + ['conversation' => ['id' => 'user_1','sender' => ['id' => 'user_2']], 'fromMe' => false,'caption' => 'Image','media' => [['id' => 'media_1','mimeType' => 'image/png','fileLength' => 3,'url' => '/messaging/media/media_1']],'mediaRetrieval' => ['state' => 'stored'],'futureField' => ['preserved' => true]];
$chat = ['conversation' => ['id' => 'user_1','phoneNumber' => '+15551234567'], 'kind' => 'direct','lastActivityAt' => '2026-10-11T00:00:00Z','lastMessage' => $summary];
$page = ['success' => true,'hasMore' => true,'nextCursor' => 'next_1','previousCursor' => null];
$window = ['state' => 'open','reason' => null,'openedAt' => '2026-10-11T00:00:00Z','expiresAt' => '2026-10-12T00:00:00Z','checkedAt' => '2026-10-11T00:00:00Z'];
$cases = [
 ['GET','',['limit' => '25','kind' => 'direct'],null,$page + ['data' => [$chat]],true,fn ($r) => $r->list('support', ['limit' => 25,'kind' => 'direct'])],
 ['GET','/user_1',[],null,['success' => true,'data' => $chat],true,fn ($r) => $r->retrieve('support', 'user_1')],
 ['GET','/user_1/messages',['cursor' => 'next_1','order' => 'asc','types' => 'text,image'],null,$page + ['data' => [$message]],true,fn ($r) => $r->listMessages('support', 'user_1', ['cursor' => 'next_1','order' => 'asc','types' => 'text,image'])],
 ['GET','/user_1/messages/msg_1',[],null,['success' => true,'data' => $message],true,fn ($r) => $r->retrieveMessage('support', 'user_1', 'msg_1')],
 ['GET','/user_1/messages/msg_1/media',[],null,'abc',true,fn ($r) => $r->downloadMessageMedia('support', 'user_1', 'msg_1')],
 ['PUT','/user_1/messages/msg_1',[],['text' => 'Edited','transport' => 'official_api'],['success' => true],false,fn ($r) => $r->editMessage('support', 'user_1', 'msg_1', ['text' => 'Edited','transport' => 'official_api'])],
 ['DELETE','/user_1/messages/msg_1',['transport' => 'official_api'],null,['success' => true],false,fn ($r) => $r->deleteMessage('support', 'user_1', 'msg_1', 'official_api')],
 ['POST','/user_1/archive',[],null,['success' => true],false,fn ($r) => $r->archive('support', 'user_1')],
 ['POST','/user_1/unarchive',[],null,['success' => true],false,fn ($r) => $r->unarchive('support', 'user_1')],
 ['PUT','/user_1/disappearing',[],['durationSeconds' => 86400],['success' => true],false,fn ($r) => $r->setDisappearingTimer('support', 'user_1', 86400)],
 ['GET','/user_1/service-window',[],null,['success' => true,'data' => $window],true,fn ($r) => $r->getServiceWindow('support', 'user_1')],
];
foreach ($cases as [$method,$suffix,$query,$body,$fixture,$server,$invoke]) {
    $history = [];
    $response = is_string($fixture) ? new GuzzleHttp\Psr7\Response(200, ['x-request-id' => 'req_test'], $fixture) : jsonResponse($fixture);
    $client = new Polymorfa\MessagingClient($credential, http:mocked([$response], $history));
    $result = $invoke($client->chats);
    $request = $history[0]['request'];
    parse_str($request->getUri()->getQuery(), $actual);
    check($request->getMethod() === $method && $request->getUri()->getPath() === '/messaging/support/chats'.$suffix, 'Chat route');
    check($actual === $query && json_decode((string)$request->getBody(), true) === $body, 'Chat query and body');
    check($result->data === $fixture && $result->metadata->requestId === 'req_test', 'Chat response and metadata');
    if ($method === 'DELETE' || ($method === 'PUT' && str_contains($suffix, 'messages'))) {
        check($request->getHeaderLine('Idempotency-Key') !== '', 'Edit/delete idempotency');
    }
    if ($server) {
        $browser = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_fixture'));
        raises(fn () => $invoke($browser->chats), Polymorfa\ConfigurationException::class);
    }
}
echo count($cases)." typed history/chat method fixtures passed.\n";
