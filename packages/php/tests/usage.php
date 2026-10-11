<?php

declare(strict_types=1);
$total = ['meter' => 'call.duration','unit' => 'second','keySource' => 'none','quantity' => 1.25,'records' => 1];
$summary = ['period' => '2026-10','start' => '2026-10-01T00:00:00Z','end' => '2026-11-01T00:00:00Z','projectId' => null,'session' => null,'billingEnabled' => false,'meters' => [$total],'numbers' => [['session' => 'support','projectId' => 'project','meters' => [$total]]],'numbersTruncated' => false];
$record = ['id' => 'usage','meter' => 'call.duration','quantity' => 1.25,'unit' => 'second','dimensions' => ['direction' => 'outbound','video' => false],'keySource' => 'none','sourceKind' => 'call','sourceId' => 'call','projectId' => null,'session' => null,'occurredAt' => '2026-10-11T00:00:00Z','recordedAt' => '2026-10-11T00:00:01Z','revision' => 2,'pricingState' => 'unpriced','rateCard' => null,'pricedCredits' => null];
$page = ['records' => [$record],'nextCursor' => null];
$gates = ['session' => null,'gates' => [['key' => 'voice.storage.transcripts','kind' => 'quota','subject' => 'team','mode' => 'off','active' => false,'limit' => null,'used' => null,'unit' => null,'overLimit' => null,'decisions' => ['wouldBlock' => 0,'blocked' => 0,'evaluationError' => 0]]]];
$cases = [
 ['GET','/platform/usage?period=2026-10',null,['data' => $summary],fn ($c) => $c->usage->summary(['period' => '2026-10']),$summary],
 ['GET','/platform/usage/records?meter=call.duration&limit=2',null,['data' => $page],fn ($c) => $c->usage->listRecords(['meter' => 'call.duration','limit' => 2]),$page],
 ['GET','/platform/gates',null,['data' => $gates],fn ($c) => $c->usage->listGates(),$gates],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$projectCases = [['GET','/platform/usage?projectId=project',null,['data' => $summary],fn ($c) => $c->usage->summary(['projectId' => 'other']),$summary]];
nativeCases($projectCases, fn ($credential, $url) => (new Polymorfa\Client($credential, baseUrl:$url))->project('project'));
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => ['records' => [$record],'nextCursor' => 'next']]),jsonResponse(['data' => ['records' => [$record],'nextCursor' => null]])], $history));
check(count(iterator_to_array($client->usage->iterateRecords())) === 2 && count($history) === 2, 'Usage lazy iterator');
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => ['records' => [$record],'nextCursor' => 'next']]),jsonResponse(['data' => ['records' => [$record],'nextCursor' => 'next']])], $history));
raises(fn () => iterator_to_array($client->usage->iterateRecords()), Polymorfa\ServerException::class);
