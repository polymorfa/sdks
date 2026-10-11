<?php

declare(strict_types=1);
$time = '2026-10-11T00:00:00Z';
$idem = ['id' => 'idem','key' => 'fixture','replayed' => true,'createdAt' => $time,'expiresAt' => $time];
$event = ['id' => 'event','organizationId' => 'org','projectId' => null,'type' => 'session.status','source' => 'runtime','environment' => 'production','createdAt' => $time,'payloadAvailability' => 'not_retained','payload' => null,'replayableUntil' => null,'metadataExpiresAt' => $time];
$replay = ['eventId' => 'event','deliveryId' => 'delivery','operationId' => 'op','idempotency' => $idem];
$secretMetadata = ['version' => 2,'createdAt' => $time,'previousValidUntil' => null];
$webhook = ['id' => 'webhook','organizationId' => 'org','owner' => 'organization','projectId' => null,'url' => 'https://fixture.invalid/events','eventTypes' => ['session.status'],'enabled' => false,'format' => 'native','retryPolicy' => ['maximumAttempts' => 5,'backoff' => 'exponential','initialDelaySeconds' => 2],'headers' => [['name' => 'X-Application']],'secret' => $secretMetadata,'createdAt' => $time,'updatedAt' => $time];
$creation = ['webhook' => $webhook,'operationId' => null,'idempotency' => $idem,'secret' => null,'secretAvailable' => false];
$mutation = ['webhook' => $webhook,'operationId' => null,'idempotency' => $idem];
$deletion = ['webhookId' => 'webhook','deleted' => true,'operationId' => null,'idempotency' => $idem];
$rotation = ['webhookId' => 'webhook','operationId' => null,'secret' => null,'secretAvailable' => false,'secretMetadata' => $secretMetadata,'idempotency' => $idem];
$delivery = ['id' => 'delivery','organizationId' => 'org','projectId' => null,'eventId' => 'event','webhookId' => 'webhook','status' => 'failed','attemptCount' => 1,'capabilities' => ['retryable' => false],'payloadAvailability' => 'expired','replayableUntil' => null,'metadataExpiresAt' => $time,'nextAttemptAt' => null,'lastAttemptAt' => $time,'completedAt' => $time,'createdAt' => $time,'updatedAt' => $time,'lastOutcome' => ['statusCode' => 503,'errorCode' => 'upstream']];
$attempt = ['id' => 'attempt','organizationId' => 'org','projectId' => null,'deliveryId' => 'delivery','number' => 1,'status' => 'failed','startedAt' => $time,'completedAt' => $time,'nextRetryAt' => null,'durationMs' => 1.25,'statusCode' => 503,'errorCode' => 'upstream','response' => ['contentType' => 'text/plain','excerpt' => 'Failure','truncated' => true],'metadataExpiresAt' => $time];
$retry = ['deliveryId' => 'delivery','attemptId' => 'attempt','operationId' => 'op','idempotency' => $idem];
$operation = ['id' => 'op','organizationId' => 'org','projectId' => null,'kind' => 'session_lifecycle','status' => 'action_required','resource' => ['type' => 'session','id' => 'session'],'sequence' => 3,'capabilities' => ['cancellable' => true,'watchable' => true],'progress' => ['code' => 'queued','current' => null,'total' => null],'result' => ['receipt' => null],'error' => null,'actionRequired' => ['code' => 'approval','details' => ['enabled' => false]],'createdAt' => $time,'updatedAt' => $time,'completedAt' => null];
$transition = ['operationId' => 'op','sequence' => 3,'fromStatus' => 'running','toStatus' => 'action_required','reasonCode' => null,'occurredAt' => $time,'snapshot' => ['progress' => $operation['progress'],'error' => null,'actionRequired' => $operation['actionRequired']]];
$cancellation = ['operation' => $operation,'operationId' => 'op','idempotency' => $idem];
$page = fn ($data) => ['data' => [$data],'page' => ['nextCursor' => null,'hasMore' => false]];
$indexedResponse = fn ($result) => new Polymorfa\ApiResponse($result->items, $result->metadata);
$pageResponse = fn ($result) => new Polymorfa\ApiResponse($result->items, $result->response->metadata);
foreach (['/platform','/platform/projects/project'] as $prefix) {
    $project = $prefix !== '/platform';
    $event['projectId'] = $project ? 'project' : null;
    $webhook['projectId'] = $project ? 'project' : null;
    $webhook['owner'] = $project ? 'project' : 'organization';
    $creation['webhook'] = $mutation['webhook'] = $webhook;
    $delivery['projectId'] = $attempt['projectId'] = $operation['projectId'] = $project ? 'project' : null;
    $cancellation['operation'] = $operation;
    $cases = [
        ['GET',$prefix.'/events?type=session.status&limit=2',null,$page($event),fn ($c) => $pageResponse($c->events->list(['type' => 'session.status','limit' => 2])),[$event]],
        ['GET',$prefix.'/events/event?includePayload=false',null,['data' => $event],fn ($c) => $c->events->retrieve('event', ['includePayload' => false]),$event],
        ['POST',$prefix.'/events/event/replays',['webhookId' => 'webhook'],['data' => $replay],fn ($c) => $c->events->replay('event', ['webhookId' => 'webhook']),$replay],
        ['GET',$prefix.'/webhooks?enabled=false&limit=2',null,$page($webhook),fn ($c) => $pageResponse($c->webhooks->list(['enabled' => false,'limit' => 2])),[$webhook]],
        ['POST',$prefix.'/webhooks',['url' => 'https://fixture.invalid/events','eventTypes' => [],'enabled' => false,'headers' => []],['data' => $creation],fn ($c) => $c->webhooks->create(['url' => 'https://fixture.invalid/events','eventTypes' => [],'enabled' => false,'headers' => []]),$creation],
        ['GET',$prefix.'/webhooks/webhook',null,['data' => $webhook],fn ($c) => $c->webhooks->retrieve('webhook'),$webhook],
        ['PATCH',$prefix.'/webhooks/webhook',['enabled' => false,'eventTypes' => []],['data' => $mutation],fn ($c) => $c->webhooks->update('webhook', ['enabled' => false,'eventTypes' => []]),$mutation],
        ['DELETE',$prefix.'/webhooks/webhook',null,['data' => $deletion],fn ($c) => $c->webhooks->delete('webhook'),$deletion],
        ['POST',$prefix.'/webhooks/webhook/tests',[],['data' => $replay],fn ($c) => $c->webhooks->test('webhook'),$replay],
        ['POST',$prefix.'/webhooks/webhook/secret-rotations',['overlapSeconds' => 0],['data' => $rotation],fn ($c) => $c->webhooks->rotateSecret('webhook', ['overlapSeconds' => 0]),$rotation],
        ['GET',$prefix.'/webhook-deliveries?status=failed',null,$page($delivery),fn ($c) => $pageResponse($c->webhookDeliveries->list(['status' => 'failed'])),[$delivery]],
        ['GET',$prefix.'/webhook-deliveries/delivery',null,['data' => $delivery],fn ($c) => $c->webhookDeliveries->retrieve('delivery'),$delivery],
        ['GET',$prefix.'/webhook-deliveries/delivery/attempts?limit=2',null,$page($attempt),fn ($c) => $pageResponse($c->webhookDeliveries->listAttempts('delivery', ['limit' => 2])),[$attempt]],
        ['GET',$prefix.'/webhook-deliveries/delivery/attempts/attempt',null,['data' => $attempt],fn ($c) => $c->webhookDeliveries->retrieveAttempt('delivery', 'attempt'),$attempt],
        ['POST',$prefix.'/webhook-deliveries/delivery/retry',[],['data' => $retry],fn ($c) => $c->webhookDeliveries->retry('delivery'),$retry],
        ['GET',$prefix.'/operations?kind=session_lifecycle',null,$page($operation),fn ($c) => $pageResponse($c->operations->list(['kind' => 'session_lifecycle'])),[$operation]],
        ['GET',$prefix.'/operations/op?wait=1&afterSequence=2',null,['data' => $operation],fn ($c) => $c->operations->retrieve('op', ['wait' => 1,'afterSequence' => 2]),$operation],
        ['GET',$prefix.'/operations/op/transitions?afterSequence=2',null,$page($transition),fn ($c) => $pageResponse($c->operations->listTransitions('op', ['afterSequence' => 2])),[$transition]],
        ['POST',$prefix.'/operations/op/cancel',null,['data' => $cancellation],fn ($c) => $c->operations->cancel('op'),$cancellation],
        ['GET',$prefix.'/events?afterOffset=9223372036854775806',null,['data' => [$event],'page' => ['hasMore' => false,'nextOffset' => null,'highWatermark' => '9223372036854775807']],fn ($c) => $indexedResponse($c->events->listIndexed(['afterOffset' => '9223372036854775806'])),[$event]],
    ];
    if ($project) {
        $ack = ['streamId' => 'stream','acknowledgedCursor' => 'cursor','sequence' => 4,'replayed' => true];
        $cases[] = ['POST',$prefix.'/events/stream/stream/ack',['cursor' => 'cursor','sequence' => 4],['data' => $ack],fn ($c) => $c->events->acknowledgeStream('stream', 'cursor', 4),$ack];
    }
    nativeCases($cases, fn ($credential, $url) => $project ? (new Polymorfa\Client($credential, baseUrl:$url))->project('project') : new Polymorfa\Client($credential, baseUrl:$url));
}
foreach (['01','-1','9223372036854775808','1.0'] as $offset) {
    raises(fn () => (new Polymorfa\Client($credential))->events->listIndexed(['afterOffset' => $offset]), Polymorfa\ConfigurationException::class);
}
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => [],'page' => ['hasMore' => true,'nextOffset' => '1','highWatermark' => '2']]),jsonResponse(['data' => [],'page' => ['hasMore' => false,'nextOffset' => null,'highWatermark' => '2']])], $history));
$indexed = $client->events->list(['afterOffset' => '0']);
check($indexed instanceof Polymorfa\IndexedEventPage && $indexed->nextPage()->highWatermark === '2', 'Indexed event next page');
check((string)$history[1]['request']->getUri() === 'https://api.polymorfa.com/platform/events?afterOffset=1', 'Offset query advancement');
foreach ([['hasMore' => true,'nextOffset' => '0','highWatermark' => '2'],['hasMore' => true,'nextOffset' => '3','highWatermark' => '2'],['hasMore' => false,'nextOffset' => '1','highWatermark' => '2']] as $invalid) {
    $history = [];
    $client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => [],'page' => $invalid])], $history));
    $error = raises(fn () => $client->events->listIndexed(['afterOffset' => '0']), Polymorfa\ServerException::class);
    check($error->errorCode === 'invalid_response', 'Indexed event rejects invalid page');
}
$history = [];
$finished = array_replace($operation, ['status' => 'succeeded','sequence' => 4]);
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => $operation]),jsonResponse(['data' => $finished])], $history));
check($client->operations->wait('op', 31)->data === $finished, 'Operation waits for terminal receipt');
check(count($history) === 2 && $history[0]['request']->getHeaderLine('Idempotency-Key') === '', 'Reads do not mint idempotency');
$history = [];
$client = new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => $cancellation])], $history));
$client->operations->cancel('op');
check($history[0]['request']->getHeaderLine('Idempotency-Key') !== '', 'Operation cancellation mints invocation key');
raises(fn () => $client->operations->retrieve('op',['wait' => 31]),Polymorfa\ConfigurationException::class);
