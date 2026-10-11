<?php

declare(strict_types=1);
$log = ['id' => 'request','projectId' => 'project','createdAt' => '2026-10-11T00:00:00Z','method' => 'POST','route' => '/messaging/:session/messages','status' => 503,'durationMs' => 1.25,'result' => 'failure','source' => 'mcp','requestId' => 'request_id','traceId' => null,'errorCode' => 'upstream','mcpTool' => 'send_message','credential' => ['type' => 'project_token','id' => null,'last4' => 'abcd']];
$logBody = ['data' => [$log],'page' => ['hasMore' => false,'nextCursor' => null,'followCursor' => 'follow_cursor']];
$logResponse = fn ($page) => new Polymorfa\ApiResponse($page->items, $page->metadata);
nativeCases([
 ['GET','/platform/projects/project/request-logs?status=404%2C5xx&method=GET%2CPOST&source=mcp&since=2026-10-11T00%3A00%3A00.000Z&limit=2',null,$logBody,fn ($c) => $logResponse($c->requestLogs->list(['projectId' => 'project','status' => [404,'5xx'],'method' => ['GET','POST'],'source' => 'mcp','since' => new DateTimeImmutable('2026-10-11T00:00:00Z'),'limit' => 2])),[$log]],
 ['GET','/platform/projects/project/request-logs?after=follow_cursor&limit=2',null,$logBody,fn ($c) => $logResponse($c->requestLogs->follow(['projectId' => 'project','after' => 'follow_cursor','limit' => 2])),[$log]],
], fn ($credential, $url) => new Polymorfa\Client($credential, baseUrl:$url));
nativeCases([
 ['GET','/platform/projects/project/request-logs?cursor=older',null,$logBody,fn ($c) => $logResponse($c->requestLogs->list(['cursor' => 'older','method' => []])),[$log]],
 ['GET','/platform/projects/project/request-logs?after=follow_cursor',null,$logBody,fn ($c) => $logResponse($c->requestLogs->follow(['after' => 'follow_cursor'])),[$log]],
], fn ($credential, $url) => (new Polymorfa\Client($credential, baseUrl:$url))->project('project'));
$client = new Polymorfa\Client($credential);
raises(fn () => $client->requestLogs->list(), Polymorfa\ConfigurationException::class);
raises(fn () => $client->project('project')->requestLogs->list(['projectId' => 'other']), Polymorfa\ValidationException::class);
raises(fn () => $client->requestLogs->list(['projectId' => 'project','cursor' => 'cursor','status' => ['5xx']]), Polymorfa\ValidationException::class);
foreach ([['intervalMs' => 999],['intervalMs' => 60001],['backfill' => 101]] as $invalid) {
    raises(fn () => iterator_to_array($client->requestLogs->tail($invalid)), Polymorfa\ValidationException::class);
}
$history = [];
$cancel = new Polymorfa\CancellationToken();
$firstLog = array_replace($log, ['id' => 'first']);
$nextLog = array_replace($log, ['id' => 'new']);
$client = (new Polymorfa\Client($credential, http:mocked([
 jsonResponse(['data' => [$log,$firstLog],'page' => ['hasMore' => false,'nextCursor' => null,'followCursor' => 'f1']]),
 jsonResponse(['data' => [$nextLog],'page' => ['hasMore' => false,'nextCursor' => null,'followCursor' => 'f2']]),
], $history)))->project('project');
$yielded = [];
foreach ($client->requestLogs->tail(['backfill' => 2], new Polymorfa\RequestOptions(cancellation:$cancel)) as $entry) {
    $yielded[] = $entry['id'];
    if (count($yielded) === 3) {
        $cancel->cancel();
    }
}
check($yielded === ['first','request','new'] && count($history) === 2, 'Tail backfill reverses newest first then follows oldest first and cancels');
check(Polymorfa\Resources\RequestLogs::retryAfterMilliseconds('0') === 0 && Polymorfa\Resources\RequestLogs::retryAfterMilliseconds('999999') === 300000 && Polymorfa\Resources\RequestLogs::retryAfterMilliseconds('invalid') === 60000 && Polymorfa\Resources\RequestLogs::retryAfterMilliseconds('Sun, 11 Oct 2026 00:00:01 GMT', strtotime('2026-10-11T00:00:00Z')) === 1000, 'Tail Retry-After bounds');
$history = [];
$client = (new Polymorfa\Client($credential, http:mocked([jsonResponse(['data' => [],'page' => ['hasMore' => false,'followCursor' => 'f']])], $history)))->project('project');
$error = raises(fn () => $client->requestLogs->list(), Polymorfa\ServerException::class);
check($error->errorCode === 'invalid_response' && $error->metadata !== null,'Request log invalid page retains metadata');
