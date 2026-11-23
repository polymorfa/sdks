<?php

declare(strict_types=1);
$base = '/messaging/connection/official-groups';
$list = ['groups' => [['id' => 'group','subject' => 'Official']],'cursors' => ['after' => 'next'],'hasMore' => true];
$group = ['id' => 'group','subject' => 'Official','suspended' => false,'participantCount' => 1,'joinApprovalRequired' => false,'participants' => [['id' => 'conversation','bsuid' => 'opaque']]];
$join = ['items' => [['joinRequestId' => 'join','user' => ['id' => 'conversation']]],'cursors' => [],'hasMore' => false];
$decision = ['succeeded' => [],'failed' => [['joinRequestId' => 'join','errors' => [['code' => 409,'title' => 'Already handled']]]]];
$accepted = ['accepted' => true];
$link = ['inviteLink' => 'https://fixture.invalid/invite'];
$envelope = fn ($data) => ['success' => true,'data' => $data];
nativeCases([
 ['GET',$base.'?limit=2&after=next',null,$envelope($list),fn ($c) => $c->officialGroups->list('connection', ['limit' => 2,'after' => 'next'])],
 ['POST',$base,['subject' => 'Official','joinApprovalRequired' => false],$envelope(['requestId' => 'request']),fn ($c) => $c->officialGroups->create('connection', ['subject' => 'Official','joinApprovalRequired' => false])],
 ['GET',$base.'/group',null,$envelope($group),fn ($c) => $c->officialGroups->retrieve('connection', 'group')],
 ['PATCH',$base.'/group',['description' => ''],$envelope($accepted),fn ($c) => $c->officialGroups->update('connection', 'group', ['description' => ''])],
 ['DELETE',$base.'/group',null,$envelope($accepted),fn ($c) => $c->officialGroups->delete('connection', 'group')],
 ['GET',$base.'/group/invite-link',null,$envelope($link),fn ($c) => $c->officialGroups->getInviteLink('connection', 'group')],
 ['POST',$base.'/group/invite-link/reset',null,$envelope($link),fn ($c) => $c->officialGroups->resetInviteLink('connection', 'group')],
 ['POST',$base.'/group/participants/remove',['participants' => ['conversation']],$envelope($accepted),fn ($c) => $c->officialGroups->removeParticipants('connection', 'group', ['conversation'])],
 ['GET',$base.'/group/join-requests?before=older',null,$envelope($join),fn ($c) => $c->officialGroups->listJoinRequests('connection', 'group', ['before' => 'older'])],
 ['POST',$base.'/group/join-requests/approve',['joinRequestIds' => ['join']],$envelope($decision),fn ($c) => $c->officialGroups->approveJoinRequests('connection', 'group', ['join'])],
 ['POST',$base.'/group/join-requests/reject',['joinRequestIds' => ['join']],$envelope($decision),fn ($c) => $c->officialGroups->rejectJoinRequests('connection', 'group', ['join'])],
 ['POST',$base.'/group/pins',['operation' => 'pin','messageId' => 'message','expirationDays' => 1],$envelope($accepted),fn ($c) => $c->officialGroups->pin('connection', 'group', ['operation' => 'pin','messageId' => 'message','expirationDays' => 1])],
], fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['error' => ['code' => 'unknown_outcome']], 503)], $history));
raises(fn () => $client->officialGroups->delete('connection', 'group', new Polymorfa\RequestOptions(idempotencyKey:'safe_key', maxNetworkRetries:3)), Polymorfa\ServerException::class);
check(count($history) === 1, 'Official group change sent once despite keyed retry override');
$client = new Polymorfa\MessagingClient(Polymorfa\Credential::clientToken('pmfa_ct_'.str_repeat('a', 64)));
raises(fn () => $client->officialGroups->list('connection'), Polymorfa\ConfigurationException::class);
