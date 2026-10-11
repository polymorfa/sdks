<?php

declare(strict_types=1);

$participant = ['id' => 'user_1','isAdmin' => true,'isSuperAdmin' => true];
$group = ['id' => 'group_1','name' => 'Friends','description' => 'Chat','createdAt' => 1,'participants' => [$participant],'ownerId' => 'user_1'];
$invite = ['id' => 'group_1','subject' => 'Friends','createdAt' => 1,'size' => 1,'participants' => [$participant],'creatorId' => 'user_1'];
$caps = ['status' => 'synced','syncedAt' => '2026-10-11T00:00:00Z','checkedAt' => null,'capabilities' => [['key' => 'polls.endTime','kind' => 'feature','unit' => null,'value' => true,'source' => 'server']]];
$ok = ['success' => true];
$env = fn ($data) => ['success' => true,'data' => $data];
$cases = [
 ['GET','',null,$env([$group]),fn ($g) => $g->list('support')],
 ['POST','',['name' => 'Friends','participants' => ['user_1']],$env($group),fn ($g) => $g->create('support', ['name' => 'Friends','participants' => ['user_1']])],
 ['GET','/join-info?code=abc',null,$env($invite),fn ($g) => $g->getJoinInfo('support', 'abc')],
 ['POST','/join',['code' => 'abc'],$ok,fn ($g) => $g->join('support', ['code' => 'abc'])],
 ['GET','/group_1',null,$env($group),fn ($g) => $g->retrieve('support', 'group_1')],
 ['GET','/group_1/capabilities',null,$env($caps),fn ($g) => $g->getCapabilities('support', 'group_1')],
 ['DELETE','/group_1',null,$ok,fn ($g) => $g->delete('support', 'group_1')],
 ['POST','/group_1/leave',null,$ok,fn ($g) => $g->leave('support', 'group_1')],
 ['PUT','/group_1/subject',['value' => 'Friends'],$ok,fn ($g) => $g->setSubject('support', 'group_1', ['value' => 'Friends'])],
 ['PUT','/group_1/description',['value' => 'Chat'],$ok,fn ($g) => $g->setDescription('support', 'group_1', ['value' => 'Chat'])],
 ['GET','/group_1/invite-code',null,$env(['code' => 'abc']),fn ($g) => $g->getInviteCode('support', 'group_1')],
 ['POST','/group_1/invite-code/revoke',null,$env(['code' => 'def']),fn ($g) => $g->revokeInviteCode('support', 'group_1')],
 ['GET','/group_1/participants',null,$env([$participant]),fn ($g) => $g->listParticipants('support', 'group_1')],
 ['POST','/group_1/participants/add',['participants' => ['user_1']],$ok,fn ($g) => $g->addParticipants('support', 'group_1', ['participants' => ['user_1']])],
 ['POST','/group_1/participants/remove',['participants' => ['user_1']],$ok,fn ($g) => $g->removeParticipants('support', 'group_1', ['participants' => ['user_1']])],
 ['POST','/group_1/admin/promote',['participants' => ['user_1']],$ok,fn ($g) => $g->promoteParticipants('support', 'group_1', ['participants' => ['user_1']])],
 ['POST','/group_1/admin/demote',['participants' => ['user_1']],$ok,fn ($g) => $g->demoteParticipants('support', 'group_1', ['participants' => ['user_1']])],
 ['PUT','/group_1/picture',['base64' => 'aGVsbG8='],$ok,fn ($g) => $g->setPicture('support', 'group_1', ['base64' => 'aGVsbG8='])],
 ['PUT','/group_1/settings/info-edit',['adminsOnly' => true],$ok,fn ($g) => $g->setInfoEditing('support', 'group_1', ['adminsOnly' => true])],
 ['PUT','/group_1/settings/messages',['adminsOnly' => true],$ok,fn ($g) => $g->setMessaging('support', 'group_1', ['adminsOnly' => true])],
 ['PUT','/group_1/settings/member-add',['mode' => 'admin_add'],$ok,fn ($g) => $g->setMemberAddMode('support', 'group_1', ['mode' => 'admin_add'])],
 ['PUT','/group_1/settings/join-approval',['required' => true],$ok,fn ($g) => $g->setJoinApproval('support', 'group_1', ['required' => true])],
];
foreach ($cases as [$method,$suffix,$body,$fixture,$invoke]) {
    $history = [];
    $client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($fixture)], $history));
    $response = $invoke($client->groups);
    $request = $history[0]['request'];
    check($request->getMethod() === $method, 'Group method');
    check($request->getUri()->getPath().($request->getUri()->getQuery() === '' ? '' : '?'.$request->getUri()->getQuery()) === '/messaging/support/groups'.$suffix, 'Group path');
    check(json_decode((string)$request->getBody(), true) === $body, 'Group body');
    check($response->data === $fixture && $response->metadata->requestId === 'req_test', 'Group typed response and metadata');
}
echo count($cases)." group operation fixtures passed.\n";
