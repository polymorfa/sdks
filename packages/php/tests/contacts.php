<?php

declare(strict_types=1);

$contact = ['id' => 'user_1','name' => 'Ada','pushName' => 'Ada','phoneNumber' => '+15551234567','bsuid' => '123'];
$info = ['id' => 'user_1','status' => 'Available','pictureId' => 'p1','verifiedName' => 'Ada','devices' => [['id' => 'user_1','device' => 0]]];
$business = ['id' => 'user_1','address' => 'Address','email' => 'ada@example.com','description' => 'Shop','websites' => [], 'coverPhotoId' => 'cover1','categories' => [['id' => '1','name' => 'Shop']],'options' => [],'hoursTimeZone' => 'UTC','hours' => []];
$profile = ['name' => 'Ada','status' => 'Available','profilePicUrl' => 'https://example.com/picture'];
$privacy = ['groupAdd' => 'contacts','lastSeen' => 'contacts','status' => 'contacts','profile' => 'contacts','readReceipts' => 'all','online' => 'match_last_seen','callAdd' => 'known','messages' => 'contacts','defense' => 'off','stickers' => 'contacts'];
$label = ['id' => 'label1','name' => 'Inbox','color' => 1];
$observation = ['policy' => 'cache','status' => 'fresh','labels' => [$label],'observedAt' => '2026-10-11T00:00:00Z'];
$presence = ['authoritative' => false,'desired' => 'available'];
$chatPresence = ['policy' => 'cache','status' => 'fresh','stale' => false,'typingPolicy' => 'off','typingStatus' => 'unknown','typingUnknownReason' => 'disabled'];
$env = fn ($data) => ['success' => true,'data' => $data];
$ok = ['success' => true];
$cases = [
 ['GET','/messaging/support/contacts',null,$env([$contact]),fn ($c) => $c->contacts->list('support')],
 ['GET','/messaging/support/contacts/check?phone=%2B15551234567%2C%2B15551234568',null,$env([['exists' => true,'id' => 'user_1']]),fn ($c) => $c->contacts->check('support', ['+15551234567','+15551234568'])],
 ['GET','/messaging/support/contacts/blocked',null,$env(['hash' => 'h1','contacts' => [['id' => 'user_1']]]),fn ($c) => $c->contacts->blocklist('support')],
 ['GET','/messaging/support/contacts/user_1',null,$env($contact),fn ($c) => $c->contacts->retrieve('support', 'user_1')],
 ['GET','/messaging/support/contacts/user_1/picture',null,$env(['url' => 'https://example.com/p']),fn ($c) => $c->contacts->picture('support', 'user_1')],
 ['GET','/messaging/support/contacts/user_1/info',null,$env($info),fn ($c) => $c->contacts->info('support', 'user_1')],
 ['GET','/messaging/support/contacts/user_1/devices',null,$env(['user_1:0']),fn ($c) => $c->contacts->devices('support', 'user_1')],
 ['GET','/messaging/support/contacts/user_1/business-profile',null,$env($business),fn ($c) => $c->contacts->businessProfile('support', 'user_1')],
 ['POST','/messaging/support/contacts/user_1/block',null,$ok,fn ($c) => $c->contacts->block('support', 'user_1')],
 ['POST','/messaging/support/contacts/user_1/unblock',null,$ok,fn ($c) => $c->contacts->unblock('support', 'user_1')],
 ['GET','/messaging/support/profile',null,$env($profile),fn ($c) => $c->profile->get('support')],
 ['PUT','/messaging/support/profile/name',['name' => 'Ada'],$ok,fn ($c) => $c->profile->setName('support', ['name' => 'Ada'])],
 ['PUT','/messaging/support/profile/status',['status' => 'Available'],$ok,fn ($c) => $c->profile->setStatus('support', ['status' => 'Available'])],
 ['PUT','/messaging/support/profile/picture',['url' => 'https://example.com/p'],$ok,fn ($c) => $c->profile->setPicture('support', ['url' => 'https://example.com/p'])],
 ['DELETE','/messaging/support/profile/picture',null,$ok,fn ($c) => $c->profile->deletePicture('support')],
 ['GET','/messaging/support/identities/resolve?username=ada&usernameKey=1234',null,$env(['id' => 'user_1','username' => 'ada','keyRequired' => false]),fn ($c) => $c->identities->resolve('support', ['username' => 'ada','usernameKey' => '1234'])],
 ['GET','/messaging/support/labels?includeObservation=true',null,$env($observation),fn ($c) => $c->labels->list('support', true)],
 ['POST','/messaging/support/labels',['name' => 'Inbox','color' => 1],$env($label),fn ($c) => $c->labels->create('support', ['name' => 'Inbox','color' => 1])],
 ['PUT','/messaging/support/labels/label1',['color' => 2],$ok,fn ($c) => $c->labels->update('support', 'label1', ['color' => 2])],
 ['DELETE','/messaging/support/labels/label1',null,$ok,fn ($c) => $c->labels->delete('support', 'label1')],
 ['GET','/messaging/support/labels/chats/user_1?includeObservation=false',null,$env([$label]),fn ($c) => $c->labels->listForChat('support', 'user_1', false)],
 ['PUT','/messaging/support/labels/chats/user_1',['labels' => []],$ok,fn ($c) => $c->labels->replaceForChat('support', 'user_1', [])],
 ['GET','/messaging/support/privacy',null,$env($privacy),fn ($c) => $c->privacy->get('support')],
 ['PUT','/messaging/support/privacy/online',['value' => 'match_last_seen'],$env($privacy),fn ($c) => $c->privacy->set('support', 'online', 'match_last_seen')],
 ['PUT','/messaging/support/privacy/disappearing/default',['durationSeconds' => 86400],$ok,fn ($c) => $c->privacy->setDefaultDisappearingTimer('support', ['durationSeconds' => 86400])],
 ['GET','/messaging/support/presence',null,$env($presence),fn ($c) => $c->presence->get('support')],
 ['POST','/messaging/support/presence',['presence' => 'available'],$env(['status' => 'OK']),fn ($c) => $c->presence->set('support', ['presence' => 'available'])],
 ['GET','/messaging/support/presence/user_1',null,$env($chatPresence),fn ($c) => $c->presence->getForChat('support', 'user_1')],
 ['POST','/messaging/support/presence/user_1/subscribe',null,$env(['status' => 'SUBSCRIBED','expiresAt' => '2026-10-11T00:01:00Z']),fn ($c) => $c->presence->subscribe('support', 'user_1')],
];
foreach ($cases as [$method,$path,$body,$fixture,$invoke]) {
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture)], $history));
    $result = $invoke($client);
    $request = $history[0]['request'];
    check($request->getMethod() === $method, 'Resource method: '.$path);
    check($request->getUri()->getPath().($request->getUri()->getQuery() === '' ? '' : '?'.$request->getUri()->getQuery()) === $path, 'Resource path: '.$path);
    check(json_decode((string)$request->getBody(), true) === $body, 'Resource body: '.$path);
    check($result->data === $fixture && $result->metadata->requestId === 'req_test', 'Resource typed response and metadata: '.$path);
}
raises(fn () => $client->privacy->set('support', 'online', 'contacts'), Polymorfa\ValidationException::class);
raises(fn () => $client->identities->resolve('support', ['id' => 'x','phoneNumber' => '+1']), Polymorfa\ValidationException::class);
echo count($cases)." contact/profile/identity/privacy/label/presence operation fixtures passed.\n";
