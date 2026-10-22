<?php

declare(strict_types=1);
$minimalFollowUp = ['message' => ['type' => 'text','text' => 'Hi {{first_name}}']];
$timedFollowUp = ['delaySeconds' => 60,'expirySeconds' => 86400,'message' => ['type' => 'template','templateId' => '44444444-4444-4444-8444-444444444444']];
$followUpCampaign = array_replace($campaign, ['followUp' => $minimalFollowUp]);
$followUpSummary = ['id' => 'followup','numberId' => 'sender','status' => 'scheduled','anchorKind' => 'read','firstDeliveredAt' => 1720000000001,'firstReadAt' => 1720000000002,'dueAt' => 1720000060002,'expiresAt' => 1720086400000,'sentAt' => null,'deliveredAt' => null,'readAt' => null,'repliedAt' => null,'reason' => null,'commandId' => null];
$followUpReport = ['total' => 12,'waiting' => 1,'scheduled' => 2,'sending' => 3,'sent' => 4,'delivered' => 5,'read' => 6,'replied' => 7,'cancelled' => 8,'expired' => 9,'failed' => 10,'unknown' => 11,'nextDueAt' => 1720000000001];
$followUpRecipient = array_replace($recipient, ['followUp' => $followUpSummary]);
$followUpAnalytics = array_replace($analytics, ['followUps' => $followUpReport]);
$base = '/messaging/projects/project/campaigns';
$cases = [
 ['POST',$base,['name' => 'Campaign','followUp' => $minimalFollowUp],['success' => true,'data' => $followUpCampaign],fn ($c) => $c->campaigns->create('project', ['name' => 'Campaign','followUp' => $minimalFollowUp])],
 ['PATCH',$base.'/campaign',['followUp' => $timedFollowUp],['success' => true,'data' => $followUpCampaign],fn ($c) => $c->campaigns->update('project', 'campaign', ['followUp' => $timedFollowUp])],
 ['PATCH',$base.'/campaign',['followUp' => null],['success' => true,'data' => $campaign + ['followUp' => null]],fn ($c) => $c->campaigns->update('project', 'campaign', ['followUp' => null])],
 ['GET',$base.'/campaign/analytics',null,['success' => true,'data' => $followUpAnalytics],fn ($c) => $c->campaigns->analytics('project', 'campaign')],
 ['GET',$base.'/campaign/recipients',null,['success' => true,'data' => [$followUpRecipient,$recipient + ['followUp' => null]],'page' => ['nextCursor' => null,'hasMore' => false]],fn ($c) => $c->campaigns->listRecipients('project', 'campaign')],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
$base = '/platform/campaigns';
$platformFollowUps = $followUpAnalytics + ['averageResponseTimeMs' => null,'minResponseTimeMs' => null,'maxResponseTimeMs' => null];
$cases = [
 ['POST',$base,['projectId' => '11111111-1111-4111-8111-111111111111','name' => 'Campaign','followUp' => $timedFollowUp],['data' => $followUpCampaign],fn ($c) => $c->campaigns->create(['projectId' => '11111111-1111-4111-8111-111111111111','name' => 'Campaign','followUp' => $timedFollowUp])],
 ['PATCH',$base.'/campaign?projectId=11111111-1111-4111-8111-111111111111',['followUp' => $minimalFollowUp],['data' => $followUpCampaign],fn ($c) => $c->campaigns->update('campaign', ['followUp' => $minimalFollowUp], ['projectId' => '11111111-1111-4111-8111-111111111111'])],
 ['PATCH',$base.'/campaign?projectId=11111111-1111-4111-8111-111111111111',['followUp' => null],['data' => $campaign + ['followUp' => null]],fn ($c) => $c->campaigns->update('campaign', ['followUp' => null], ['projectId' => '11111111-1111-4111-8111-111111111111'])],
 ['GET',$base.'/campaign/analytics?projectId=11111111-1111-4111-8111-111111111111',null,['data' => $platformFollowUps],fn ($c) => $c->campaigns->analytics('campaign', ['projectId' => '11111111-1111-4111-8111-111111111111'])],
 ['GET',$base.'/campaign/recipients?projectId=11111111-1111-4111-8111-111111111111',null,['data' => [$followUpRecipient],'page' => ['nextCursor' => null,'hasMore' => false]],fn ($c) => $c->campaigns->recipients('campaign', ['projectId' => '11111111-1111-4111-8111-111111111111'])],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['error' => ['code' => 'feature_unavailable','message' => 'Enrollment required.']], 403)], $history));
$error = raises(fn () => $client->campaigns->update('project', 'campaign', ['followUp' => $minimalFollowUp]), Polymorfa\AuthorizationException::class);
check($error->errorCode === 'feature_unavailable' && count($history) === 1, 'Follow-up enrollment denial remains authoritative.');
