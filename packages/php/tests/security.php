<?php

declare(strict_types=1);
$audit = ['id' => 'audit','actorEmail' => 'u@example.com','actorUserId' => null,'actorRole' => null,'action' => 'read','resource' => 'project','projectId' => null,'projectName' => null,'ip' => null,'userAgent' => null,'duration' => null,'source' => null,'description' => null,'result' => 'success','metadata' => ['future' => false],'createdAt' => 1];
$ban = ['id' => 'ban','sessionName' => 'support','banCode' => null,'banReason' => null,'banExpiresAt' => null,'occurredAt' => 1,'status' => 'active'];
$incident = ['id' => 'incident','keyId' => 'key','tokenType' => 'organization_api_key','source' => 'api','url' => null,'ref' => null,'resolution' => 'pending','detectedAt' => 1,'acknowledgedAt' => null,'acknowledgedBy' => null,'createdAt' => 1];
$settings = ['enabled' => false,'optOutKeywords' => ['STOP'],'optInKeywords' => ['START'],'updatedAt' => null];
$update = $settings;
unset($update['updatedAt']);
$cases = [
 ['GET','/platform/audit?action=read&resource=project&limit=2',null,['data' => [$audit]],fn ($c) => $c->auditLogs->list(['action' => 'read','resource' => 'project','limit' => 2])],
 ['GET','/platform/bans',null,['data' => [$ban]],fn ($c) => $c->sessionBans->list()],
 ['GET','/platform/bans/active',null,['data' => [$ban]],fn ($c) => $c->sessionBans->listActive()],
 ['GET','/platform/incidents',null,['data' => [$incident]],fn ($c) => $c->securityIncidents->list()],
 ['POST','/platform/incidents/incident/acknowledge',null,['data' => ['acknowledged' => true]],fn ($c) => $c->securityIncidents->acknowledge('incident')],
 ['GET','/platform/optouts',null,['data' => ['phones' => []]],fn ($c) => $c->optOuts->list()],
 ['POST','/platform/optouts',['phone' => '+15551234567'],['data' => ['added' => true]],fn ($c) => $c->optOuts->create(['phone' => '+15551234567'])],
 ['POST','/platform/optouts/batch',['phones' => ['+15551234567']],['data' => ['added' => 1]],fn ($c) => $c->optOuts->createBatch(['phones' => ['+15551234567']])],
 ['GET','/platform/optouts/settings',null,['data' => $settings],fn ($c) => $c->optOuts->getSettings()],
 ['PUT','/platform/optouts/settings',$update,['data' => $settings],fn ($c) => $c->optOuts->updateSettings($update)],
 ['DELETE','/platform/optouts/%2B15551234567',null,['data' => ['removed' => true]],fn ($c) => $c->optOuts->delete('+15551234567')],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
