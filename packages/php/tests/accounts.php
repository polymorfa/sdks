<?php

declare(strict_types=1);
$org = ['id' => 'org','externalId' => 'ext','name' => 'Team','slug' => null,'email' => 'team@example.com','timezone' => null,'creditBalanceCents' => 1.234567,'lowBalanceThresholdCents' => 50,'billingEmail' => null,'status' => 'active','plan' => 'payg','planStatus' => null,'isActive' => true,'createdAt' => 1,'updatedAt' => 2];
$member = ['_id' => 'member','_creationTime' => 1,'orgId' => 'org','userId' => 'user','email' => 'u@example.com','name' => null,'role' => 'owner','status' => 'active','invitedAt' => null,'joinedAt' => 2];
$key = ['_id' => 'key','_creationTime' => 1,'id' => 'key','keyId' => 'key','start' => 'pmfa_','last4' => 'last','orgId' => 'org','label' => 'Server','scopes' => 2,'source' => 'api','expiresAt' => 0,'isActive' => false];
$token = ['id' => 'token','start' => 'pmfa_pt','last4' => 'last','label' => null,'scopes' => 1,'expiresAt' => null,'createdAt' => 1,'lastUsedAt' => null,'revokedAt' => null];
$project = ['id' => 'project','orgId' => 'org','name' => 'Project','slug' => 'project','icon' => ['type' => 'emoji','value' => '🐈'],'defaultTier' => 'free','isActive' => true,'stage' => 'development'];
$stats = $project;
unset($stats['id']);
$stats += ['_id' => 'project','_creationTime' => 1,'activeSessions' => 0,'totalSessions' => 1,'totalMessages' => 2,'lastActivity' => null,'iconUrl' => null];
$business = ['name' => 'Business','website' => 'https://example.com','supportEmail' => 'support@example.com'];
$enrollment = ['id' => 'project','orgId' => 'org','name' => 'Project','slug' => 'project','stage' => 'development','operationId' => 'op','enrollmentStatus' => 'approval_required','billingMode' => 'payg'];
$number = ['id' => 'number','name' => 'support','transport' => 'linked_devices','status' => 'connected','canBeAbsorbed' => false];
$cases = [
 ['GET','/platform/team',null,['data' => $org],fn ($c) => $c->organizations->retrieve()],
 ['GET','/platform/members',null,['data' => [$member]],fn ($c) => $c->members->list()],
 ['GET','/platform/keys',null,['data' => [$key]],fn ($c) => $c->apiKeys->list()],
 ['DELETE','/platform/keys/key',null,['data' => ['ok' => true,'keyId' => 'key']],fn ($c) => $c->apiKeys->deactivate('key')],
 ['GET','/platform/tokens?projectId=project',null,['data' => [$token]],fn ($c) => $c->projectTokens->list('project')],
 ['GET','/platform/projects',null,['data' => [$stats]],fn ($c) => $c->projects->list()],
 ['POST','/platform/projects',['name' => 'Project','icon' => ['type' => 'emoji','value' => '🐈'],'defaultTier' => 'free'],['data' => $project],fn ($c) => $c->projects->create(['name' => 'Project','icon' => ['type' => 'emoji','value' => '🐈'],'defaultTier' => 'free'])],
 ['GET','/platform/projects/project/hybrid-merge-candidates',null,['data' => [['numbers' => [$number,$number],'eligible' => false,'ineligibleReason' => 'hms_enabled']]],fn ($c) => $c->projects->listHybridMergeCandidates('project')],
 ['POST','/platform/projects/project/promote',['business' => $business],['data' => $enrollment],fn ($c) => $c->projects->requestProductionEnrollment('project', ['business' => $business])],
 ['POST','/platform/projects/project/production-enrollments/op/approve',null,['data' => ['operationId' => 'op','action' => 'approve','accepted' => true]],fn ($c) => $c->projects->approveProductionEnrollment('project', 'op')],
 ['POST','/platform/projects/project/production-enrollments/op/cancel',null,['data' => ['operationId' => 'op','action' => 'cancel','accepted' => true]],fn ($c) => $c->projects->cancelProductionEnrollment('project', 'op')],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
