<?php

declare(strict_types=1);
$health = ['health' => null,'band' => 'unknown','healthSource' => 'unavailable','healthEstimatorVersion' => null,'healthModelVersion' => null,'healthEvaluatedAt' => null,'healthFeatureCoverage' => null,'healthReliability' => 'unavailable','healthUnavailableReason' => 'no_active_model','healthProbabilities' => null,'mostLikelyHealthState' => null,'healthExplanation' => null,'observedAccountState' => null];
$number = $health + ['sessionId' => 'sid','session' => 'session','phoneNumber' => '+15555555555','projectId' => 'project','enforcement' => null];
$finding = ['id' => null,'key' => 'delivery','title' => 'Delivery','summary' => 'No samples','fix' => 'Collect measurements','status' => 'not_measured','severity' => null,'occurrences' => 0,'reopenedCount' => 0,'evidence' => [],'sessionId' => 'sid','session' => 'session','phoneNumber' => '+15555555555','firstSeenAt' => null,'lastSeenAt' => null,'acknowledgedAt' => null,'acknowledgedBy' => null,'acknowledgementNote' => null,'snoozedUntil' => null,'resolvedAt' => null,'resolveReason' => null];
$detail = $number + ['warmup' => ['enabled' => false,'tenureSource' => null,'tenureDay' => 0,'allowance' => null,'sentToday' => null,'resetsAt' => null,'curve' => []],'findings' => [$finding],'liftRequires' => null,'appealState' => 'none'];
$signal = ['key' => 'delivery','label' => 'Delivery','group' => 'delivery','kind' => 'code_counts','unit' => 'count','description' => 'Delivery responses'];
$collection = ['state' => 'stale','latestFlushedAt' => null,'latestReceivedAt' => null,'freshUntil' => null,'recordVersion' => 1,'collectorVersion' => null,'partial' => true,'droppedRecords' => 3];
$snapshot = ['bucketStart' => '2026-10-11T00:00:00Z','flushedAt' => '2026-10-11T00:00:00Z','receivedAt' => '2026-10-11T00:00:00Z','partial' => true,'recordVersion' => 1,'signals' => [$signal + ['measured' => true,'value' => null,'sampleSize' => 2,'codes' => [['code' => 429,'count' => 2]]]]];
$telemetry = ['sessionId' => 'sid','session' => 'session','projectId' => 'project','collection' => $collection,'snapshot' => $snapshot];
$action = ['id' => 'action','sessionId' => 'sid','session' => 'session','projectId' => 'project','mode' => 'clear','action' => 'slow_down','status' => 'succeeded','health' => 95,'threshold' => 40,'healthSource' => 'rules_v1','estimatorVersion' => '1','modelVersion' => null,'slowDownMps' => 0.5,'evaluatedAt' => 'now','createdAt' => 'now','completedAt' => 'now','outcome' => 'cleared'];
$enforcement = $health + ['sessionId' => 'sid','session' => 'session','phoneNumber' => '+15555555555','projectId' => 'project','rung' => 'notify','previousRung' => 'none','organizationFloor' => 'none','reason' => 'Fixture','source' => 'operator','throughputPerMinute' => null,'blocksUnsolicited' => false,'suspended' => false,'blockingFindings' => [],'startedAt' => 'now','eligibleLiftAt' => null,'liftRequires' => 'Review','operatorHold' => true,'appealState' => 'requested','state' => 'applying'];
$incident = ['id' => 'incident','sessionId' => 'sid','session' => 'session','phoneNumber' => '+15555555555','projectId' => 'project','kind' => 'customer_report','source' => 'customer','resolution' => 'unresolved','ambiguous' => true,'startedAt' => 'now','endsAt' => null,'closedAt' => null,'closedBy' => null,'claimId' => null,'note' => 'Fixture','reportedBy' => 'customer','createdAt' => 'now'];
$claim = ['id' => 'claim','incidentId' => 'incident','sessionId' => 'sid','session' => 'session','phoneNumber' => '+15555555555','projectId' => 'project','status' => 'under_review','verdict' => 'inconclusive','windowStart' => 'now','windowEnd' => 'now','measuredCents' => 0.000001,'capCents' => 12.345678,'amountCents' => 0.125,'evidence' => ['attributionRuleVersion' => 1,'windowDays' => 7,'deviceEvidence' => false,'otherDevices' => 0,'restrictedInWindow' => true,'criticalFindingDays' => 2,'sharedConnection' => false,'measuredHours' => 1.5],'summary' => 'Fixture','reason' => 'Evidence pending','decidedAt' => null,'paidAt' => null,'createdAt' => 'now'];
$page = fn ($data) => ['data' => [$data],'page' => ['nextCursor' => null,'hasMore' => false]];
$envelope = fn ($data) => ['data' => $data];
$created = ['incidentId' => 'incident','created' => true,'sessionId' => 'sid','session' => 'session','occurredAt' => 'now'];
nativeCases([
 ['GET','/platform/bansafe/health?projectId=project&limit=2',null,$page($number),fn ($c) => $c->banSafe->listHealth(['projectId' => 'project','limit' => 2])],
 ['GET','/platform/bansafe/health/session',null,$envelope($detail),fn ($c) => $c->banSafe->getHealth('session')],
 ['GET','/platform/bansafe/health/session/history?since=now&limit=2',null,$envelope(['sessionId' => 'sid','session' => 'session','points' => [$health]]),fn ($c) => $c->banSafe->listHealthHistory('session', ['since' => 'now','limit' => 2])],
 ['GET','/platform/bansafe/signals',null,$envelope([$signal]),fn ($c) => $c->banSafe->listSignals()],
 ['GET','/platform/bansafe/telemetry/session',null,$envelope($telemetry),fn ($c) => $c->banSafe->getTelemetry('session')],
 ['GET','/platform/bansafe/telemetry/session/history?since=now&until=later&limit=2',null,$page($snapshot),fn ($c) => $c->banSafe->listTelemetryHistory('session', ['since' => 'now','until' => 'later','limit' => 2])],
 ['GET','/platform/bansafe/collection?projectId=project',null,$page(['sessionId' => 'sid','session' => 'session','projectId' => 'project','collection' => $collection]),fn ($c) => $c->banSafe->listCollection(['projectId' => 'project'])],
 ['GET','/platform/bansafe/health-actions?session=session&status=succeeded',null,$page($action),fn ($c) => $c->banSafe->listHealthActions(['session' => 'session','status' => 'succeeded'])],
 ['GET','/platform/bansafe/findings?session=session&severity=warning',null,$page($finding),fn ($c) => $c->banSafe->listFindings(['session' => 'session','severity' => 'warning'])],
 ['GET','/platform/bansafe/enforcement?rung=notify',null,$page($enforcement),fn ($c) => $c->banSafe->listEnforcement(['rung' => 'notify'])],
 ['GET','/platform/bansafe/incidents?session=session',null,$page($incident),fn ($c) => $c->banSafe->listIncidents(['session' => 'session'])],
 ['POST','/platform/bansafe/incidents',['session' => 'session','occurredAt' => 'now','note' => 'Fixture'],$envelope($created),fn ($c) => $c->banSafe->createIncident(['session' => 'session','occurredAt' => 'now','note' => 'Fixture'], new Polymorfa\RequestOptions(idempotencyKey:'incident-key'))],
 ['POST','/platform/bansafe/incidents/incident/retract',null,$envelope($incident),fn ($c) => $c->banSafe->retractIncident('incident')],
 ['GET','/platform/bansafe/claims?status=under_review',null,$page($claim),fn ($c) => $c->banSafe->listClaims(['status' => 'under_review'])],
 ['GET','/platform/bansafe/claims/claim',null,$envelope($claim),fn ($c) => $c->banSafe->getClaim('claim')],
], fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
check($number['health'] === null && $number['band'] === 'unknown', 'Unavailable health remains distinct from a healthy score');
check($claim['measuredCents'] === 0.000001 && $claim['amountCents'] === 0.125, 'BanSafe fractional credits retained');
