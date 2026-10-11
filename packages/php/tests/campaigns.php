<?php

declare(strict_types=1);
$campaign = ['id' => 'campaign','name' => 'Campaign','status' => 'draft','templateId' => null,'recipientListId' => null,'recipientCount' => 1,'sentCount' => 0,'deliveredCount' => 0,'readCount' => 0,'failedCount' => 0,'skippedCount' => 0,'scheduledAt' => null,'launchedAt' => null,'completedAt' => null,'createdAt' => 1,'updatedAt' => 2,'sendWindow' => null,'variants' => null,'variantStrategy' => null,'experimentOutcome' => null,'messageVariations' => null];
$operation = $campaign + ['operationId' => 'operation'];
$stop = $campaign + ['operationId' => null];
$analytics = ['campaignId' => 'campaign','recipientCount' => 1,'sentCount' => 0,'deliveredCount' => 0,'readCount' => 0,'failedCount' => 0,'skippedCount' => 0,'respondedCount' => 0,'responseRate' => 0,'experiment' => null];
$recipient = ['id' => 'recipient','phone' => '+15555555555','variables' => ['name' => 'Ada'],'variantKey' => null,'status' => 'queued','attempts' => 0,'lastError' => null,'externalMessageId' => null,'queuedAt' => 1,'sentAt' => null,'deliveredAt' => null,'readAt' => null,'failedAt' => null,'respondedAt' => null];
$added = ['campaignId' => 'campaign','added' => 1,'recipientCount' => 1,'duplicateCount' => 0,'invalidCount' => 1,'invalidRows' => [['row' => 2,'reason' => 'invalid_phone']]];
$input = ['name' => 'Campaign','recipients' => [['phone' => '+15555555555','variables' => ['name' => 'Ada','count' => 2,'subscribed' => false]]],'sendWindow' => null];
$envelope = fn ($data) => ['success' => true,'data' => $data];
$base = '/messaging/projects/project/campaigns';
$cases = [
 ['GET',$base,null,$envelope([$campaign]),fn ($c) => $c->campaigns->list('project')],
 ['POST',$base,$input,$envelope($campaign),fn ($c) => $c->campaigns->create('project', $input)],
 ['GET',$base.'/campaign',null,$envelope($campaign),fn ($c) => $c->campaigns->retrieve('project', 'campaign')],
 ['PATCH',$base.'/campaign',['recipientListId' => null,'sendWindow' => null],$envelope($campaign),fn ($c) => $c->campaigns->update('project', 'campaign', ['recipientListId' => null,'sendWindow' => null])],
 ['GET',$base.'/campaign/analytics',null,$envelope($analytics),fn ($c) => $c->campaigns->analytics('project', 'campaign')],
 ['POST',$base.'/campaign/launch',[],$envelope($operation),fn ($c) => $c->campaigns->launch('project', 'campaign')],
 ['POST',$base.'/campaign/reschedule',['scheduledAt' => null],$envelope($operation),fn ($c) => $c->campaigns->reschedule('project', 'campaign', ['scheduledAt' => null])],
 ['POST',$base.'/campaign/pause',null,$envelope($operation),fn ($c) => $c->campaigns->pause('project', 'campaign')],
 ['POST',$base.'/campaign/resume',null,$envelope($operation),fn ($c) => $c->campaigns->resume('project', 'campaign')],
 ['POST',$base.'/campaign/stop',null,$envelope($stop),fn ($c) => $c->campaigns->stop('project', 'campaign')],
 ['GET',$base.'/campaign/recipients?status=queued&limit=2',null,['success' => true,'data' => [$recipient],'page' => ['nextCursor' => null,'hasMore' => false]],fn ($c) => $c->campaigns->listRecipients('project', 'campaign', ['status' => 'queued','limit' => 2])],
 ['POST',$base.'/campaign/recipients',['recipients' => [['phone' => '+15555555555']]],$envelope($added),fn ($c) => $c->campaigns->addRecipients('project', 'campaign', ['recipients' => [['phone' => '+15555555555']]])],
 ['POST',$base.'/campaign/requeue',['includeSkippedError' => false],$envelope(['requeued' => 1]),fn ($c) => $c->campaigns->requeue('project', 'campaign', ['includeSkippedError' => false])],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
$platformAnalytics = $analytics + ['averageResponseTimeMs' => null,'minResponseTimeMs' => null,'maxResponseTimeMs' => null];
$conversion = ['id' => 'conversion','campaignId' => 'campaign','recipientId' => null,'eventType' => 'purchase','occurredAt' => '2026-10-11T00:00:00Z','value' => null,'evidence' => 'customer_reported','attribution' => ['outcome' => 'opted_out','touchAt' => null,'windowDays' => 7],'recordedAt' => '2026-10-11T00:00:00Z','replayed' => true];
$conversionInput = ['projectId' => 'project','recipientId' => 'recipient','eventId' => 'customer_event','eventType' => 'purchase','occurredAt' => '2026-10-11T00:00:00Z','value' => ['amountMinor' => 100000000000000,'currency' => 'USD']];
$report = ['campaignId' => 'campaign','model' => ['touch' => 'recipient_sent','windowDays' => 7,'correlation' => 'explicit_recipient'],'sentCount' => 1,'conversions' => ['total' => 1,'attributed' => 1,'outsideWindow' => 0,'notSent' => 0,'optedOut' => 0],'convertedRecipients' => 1,'conversionRate' => 1,'values' => [['currency' => 'USD','evidence' => 'customer_reported','attributedConversions' => 1000,'attributedAmountMinor' => '100000000000000000','unattributedConversions' => 0,'unattributedAmountMinor' => '0']]];
$base = '/platform/campaigns';
$data = fn ($data) => ['data' => $data];
$cases = [
 ['GET',$base.'?projectId=project&projectSlug=slug',null,$data([$campaign]),fn ($c) => $c->campaigns->list(['projectId' => 'project','projectSlug' => 'slug'])],
 ['POST',$base,['projectId' => 'project'] + $input,$data($campaign),fn ($c) => $c->campaigns->create(['projectId' => 'project'] + $input)],
 ['GET',$base.'/campaign?projectId=project',null,$data($campaign),fn ($c) => $c->campaigns->retrieve('campaign', ['projectId' => 'project'])],
 ['PATCH',$base.'/campaign?projectId=project',['recipientListId' => null],$data($campaign),fn ($c) => $c->campaigns->update('campaign', ['recipientListId' => null], ['projectId' => 'project'])],
 ['DELETE',$base.'/campaign?projectId=project',null,$data(['deleted' => true]),fn ($c) => $c->campaigns->delete('campaign', ['projectId' => 'project'])],
 ['POST',$base.'/campaign/launch',['projectId' => 'project'],$data(['operationId' => 'operation']),fn ($c) => $c->campaigns->launch('campaign', ['projectId' => 'project'])],
 ['POST',$base.'/campaign/reschedule',['projectId' => 'project','scheduledAt' => null],$data(['operationId' => 'operation']),fn ($c) => $c->campaigns->reschedule('campaign', ['projectId' => 'project','scheduledAt' => null])],
 ['POST',$base.'/campaign/pause',null,$data(['operationId' => 'operation']),fn ($c) => $c->campaigns->pause('campaign')],
 ['POST',$base.'/campaign/resume',null,$data(['operationId' => 'operation']),fn ($c) => $c->campaigns->resume('campaign')],
 ['POST',$base.'/campaign/stop',null,$data(['operationId' => null]),fn ($c) => $c->campaigns->stop('campaign')],
 ['POST',$base.'/campaign/archive',null,$data(['archived' => true]),fn ($c) => $c->campaigns->archive('campaign')],
 ['POST',$base.'/campaign/duplicate',[],$data(['id' => 'copy']),fn ($c) => $c->campaigns->duplicate('campaign', [])],
 ['POST',$base.'/campaign/requeue',['includeSkippedError' => false],$data(['requeued' => 1]),fn ($c) => $c->campaigns->requeue('campaign', ['includeSkippedError' => false])],
 ['GET',$base.'/campaign/analytics?projectId=project',null,$data($platformAnalytics),fn ($c) => $c->campaigns->analytics('campaign', ['projectId' => 'project'])],
 ['GET',$base.'/campaign/events?projectId=project',null,$data(['events' => []]),fn ($c) => $c->campaigns->events('campaign', ['projectId' => 'project'])],
 ['GET',$base.'/campaign/recipients?projectId=project&status=queued&limit=2',null,['data' => [$recipient],'page' => ['nextCursor' => null,'hasMore' => false]],fn ($c) => $c->campaigns->recipients('campaign', ['projectId' => 'project','status' => 'queued','limit' => 2])],
 ['POST',$base.'/campaign/recipients',['projectId' => 'project','recipients' => [['phone' => '+15555555555']]],$data($added),fn ($c) => $c->campaigns->addRecipients('campaign', ['projectId' => 'project','recipients' => [['phone' => '+15555555555']]])],
 ['POST',$base.'/campaign/conversions',$conversionInput,$data($conversion),fn ($c) => $c->campaigns->recordConversion('campaign', $conversionInput)],
 ['GET',$base.'/campaign/conversions?projectId=project',null,$data($report),fn ($c) => $c->campaigns->conversions('campaign', ['projectId' => 'project'])],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse($data($campaign))], $history));
$client->campaigns->create(['projectId' => 'project'] + $input, new Polymorfa\RequestOptions(idempotencyKey:'ignored', maxNetworkRetries:3));
check($history[0]['request']->getHeaderLine('Idempotency-Key') === '', 'Platform create strips disallowed idempotency override');
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse($envelope($operation))], $history));
$client->campaigns->launch('project', 'campaign');
check($history[0]['request']->getHeaderLine('Idempotency-Key') !== '', 'Campaign lifecycle mints idempotency key');
$history = [];
$client = new Polymorfa\MessagingClient($credential, http:mocked([jsonResponse(['error' => ['code' => 'append_failed']], 503)], $history));
raises(fn () => $client->campaigns->addRecipients('project', 'campaign', ['recipients' => []], new Polymorfa\RequestOptions(idempotencyKey:'append')), Polymorfa\ServerException::class);
check(count($history) === 1, 'Append retries default off even with key');
$debug = new Polymorfa\ApiResponse(['signingSecret' => 'synthetic_sensitive_fixture'], new Polymorfa\ResponseMetadata(200, 1, [], null, null));
ob_start();
var_dump($debug);
$dump = ob_get_clean();
check(!str_contains($dump,'synthetic_sensitive_fixture') && $debug->data['signingSecret'] === 'synthetic_sensitive_fixture','Response debugging redacts payload without changing explicit data');
