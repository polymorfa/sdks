<?php

declare(strict_types=1);

$channel = ['id' => 'channel_1','name' => 'Updates','description' => 'News','profileUrl' => 'https://example.com/image','followers' => 5,'muted' => false,'preview' => false];
$message = ['position' => 5,'id' => 'msg_1','whatsapp_ids' => ['linked_devices' => 'provider_1'],'conversation' => ['id' => 'channel_1'],'type' => 'text','timestamp' => '2026-10-11T00:00:00Z','views' => 3,'reactionCounts' => ['👍' => 2],'text' => 'News'];
$cases = [
 ['GET','',[],null,[$channel],fn ($r) => $r->list('support')],
 ['POST','',[],['name' => 'Updates','description' => 'News','picture' => 'https://example.com/image'],$channel,fn ($r) => $r->create('support', ['name' => 'Updates','description' => 'News','picture' => 'https://example.com/image'])],
 ['GET','/channel_1',[],null,$channel,fn ($r) => $r->retrieve('support', 'channel_1')],
 ['DELETE','/channel_1',[],null,['status' => 'DELETED'],fn ($r) => $r->delete('support', 'channel_1')],
 ['GET','/channel_1/messages',['count' => '20','before' => '10'],null,[$message],fn ($r) => $r->listMessages('support', 'channel_1', ['count' => 20,'before' => 10])],
 ['GET','/channel_1/message-updates',['count' => '20','since' => '0','after' => '4'],null,[$message],fn ($r) => $r->listMessageUpdates('support', 'channel_1', ['count' => 20,'since' => 0,'after' => 4])],
 ['POST','/channel_1/messages/msg_1/viewed',[],null,['status' => 'VIEWED'],fn ($r) => $r->markMessageViewed('support', 'channel_1', 'msg_1')],
 ['POST','/channel_1/messages/msg_1/reaction',[],['reaction' => '👍'],['status' => 'UPDATED'],fn ($r) => $r->reactToMessage('support', 'channel_1', 'msg_1', ['reaction' => '👍'])],
 ['POST','/channel_1/live-updates',[],null,['durationSeconds' => 30],fn ($r) => $r->subscribeToLiveUpdates('support', 'channel_1')],
 ['POST','/channel_1/follow',[],null,['status' => 'FOLLOWED'],fn ($r) => $r->follow('support', 'channel_1')],
 ['POST','/channel_1/unfollow',[],null,['status' => 'UNFOLLOWED'],fn ($r) => $r->unfollow('support', 'channel_1')],
 ['POST','/channel_1/mute',[],null,['status' => 'MUTED'],fn ($r) => $r->mute('support', 'channel_1')],
 ['POST','/channel_1/unmute',[],null,['status' => 'UNMUTED'],fn ($r) => $r->unmute('support', 'channel_1')],
];
foreach ($cases as [$method,$suffix,$query,$body,$data,$invoke]) {
    $fixtures = [['success' => true,'data' => $data]];
    if ($method !== 'GET') {
        $fixtures[] = ['success' => true,'data' => ['requestId' => 'rpc_1']];
    }
    if (preg_match('~/(follow|unfollow|mute|unmute|viewed|reaction)$~', $suffix)) {
        $fixtures[] = ['success' => true];
    }
    foreach ($fixtures as $fixture) {
        $history = [];
        $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture)], $history));
        $response = $invoke($client->channels);
        $request = $history[0]['request'];
        parse_str($request->getUri()->getQuery(), $actual);
        check($request->getMethod() === $method && $request->getUri()->getPath() === '/messaging/support/channels'.$suffix, 'Channel route');
        check($actual === $query && json_decode((string)$request->getBody(), true) === $body, 'Channel query/body');
        check($response->data === $fixture && $response->metadata->requestId === 'req_test', 'Channel typed variants and metadata');
        if (str_ends_with($suffix, '/reaction')) {
            check($request->getHeaderLine('Idempotency-Key') !== '', 'Channel reaction idempotency');
        }
    }
}
echo count($cases)." typed Channels methods and response variants passed.\n";
