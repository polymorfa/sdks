<?php

declare(strict_types=1);
$p = '11111111-1111-1111-1111-111111111111';
$f = '22222222-2222-2222-2222-222222222222';
$d = '33333333-3333-3333-3333-333333333333';
$i = '44444444-4444-4444-4444-444444444444';
$s = '55555555-5555-5555-5555-555555555555';
$definition = ['id' => $f,'projectId' => $p,'name' => 'Handler','enabled' => false,'revision' => 2,'activeDeploymentId' => null,'createdAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:00Z'];
$deployment = ['id' => $d,'functionId' => $f,'source' => 'export default {}','language' => 'javascript','region' => 'US','compatibilityDate' => '2026-10-11','secretVersionIds' => [],'egressOrigins' => [],'sha256' => 'hash','createdAt' => '2026-10-11T00:00:00Z'];
$deploymentSummary = $deployment;
unset($deploymentSummary['source']);
$secret = ['id' => $s,'name' => 'TOKEN','createdAt' => '2026-10-11T00:00:00Z','revokedAt' => null];
$invocation = ['id' => $i,'functionId' => $f,'deploymentId' => $d,'outcome' => 'unknown','trigger' => 'test','errorCode' => 'executor_lost','durationMs' => null,'responseBytes' => null,'attempt' => 1,'createdAt' => '2026-10-11T00:00:00Z','completedAt' => null];
$invocationResult = ['receipt' => $invocation,'replayed' => true,'responseRetained' => false,'retryable' => false];
$request = ['method' => 'GET','url' => 'https://function.polymorfa.invalid/test','headers' => [],'bodyBase64' => ''];
$cases = [
 ['GET','/platform/functions?limit=2&before=next&projectId='.$p,null,['data' => ['items' => [$definition],'nextCursor' => null]],fn ($c) => $c->functions->list(['limit' => 2,'before' => 'next']),['items' => [$definition],'nextCursor' => null]],
 ['POST','/platform/functions',['functionId' => $f,'name' => 'Handler','projectId' => $p],['data' => $definition],fn ($c) => $c->functions->create(['functionId' => $f,'name' => 'Handler']),$definition],
 ['GET','/platform/functions/'.$f.'?projectId='.$p,null,['data' => $definition],fn ($c) => $c->functions->retrieve($f),$definition],
 ['PATCH','/platform/functions/'.$f,['expectedRevision' => 1,'enabled' => false,'projectId' => $p],['data' => $definition],fn ($c) => $c->functions->update($f, ['expectedRevision' => 1,'enabled' => false]),$definition],
 ['DELETE','/platform/functions/'.$f.'?expectedRevision=2&projectId='.$p,null,['data' => ['ok' => true]],fn ($c) => $c->functions->delete($f, 2),['ok' => true]],
 ['GET','/platform/functions/'.$f.'/deployments?projectId='.$p,null,['data' => ['items' => [$deploymentSummary],'nextCursor' => null]],fn ($c) => $c->functions->deployments->list($f),['items' => [$deploymentSummary],'nextCursor' => null]],
 ['POST','/platform/functions/'.$f.'/deployments',['deploymentId' => $d,'source' => 'export default {}','language' => 'javascript','region' => 'US','compatibilityDate' => '2026-10-11','projectId' => $p],['data' => $deployment],fn ($c) => $c->functions->deployments->create($f, ['deploymentId' => $d,'source' => 'export default {}','language' => 'javascript','region' => 'US','compatibilityDate' => '2026-10-11']),$deployment],
 ['GET','/platform/functions/'.$f.'/deployments/'.$d.'?projectId='.$p,null,['data' => $deployment],fn ($c) => $c->functions->deployments->retrieve($f, $d),$deployment],
 ['PUT','/platform/functions/'.$f.'/promotion',['deploymentId' => $d,'expectedRevision' => 1,'projectId' => $p],['data' => $definition],fn ($c) => $c->functions->deployments->promote($f, ['deploymentId' => $d,'expectedRevision' => 1]),$definition],
 ['GET','/platform/functions/'.$f.'/secrets?projectId='.$p,null,['data' => ['items' => [$secret],'nextCursor' => null]],fn ($c) => $c->functions->secrets->list($f),['items' => [$secret],'nextCursor' => null]],
 ['POST','/platform/functions/'.$f.'/secrets',['name' => 'TOKEN','value' => 'synthetic_fixture_only','projectId' => $p],['data' => $secret],fn ($c) => $c->functions->secrets->create($f, ['name' => 'TOKEN','value' => 'synthetic_fixture_only']),$secret],
 ['DELETE','/platform/functions/'.$f.'/secrets/'.$s.'?projectId='.$p,null,['data' => ['ok' => true]],fn ($c) => $c->functions->secrets->revoke($f, $s),['ok' => true]],
 ['GET','/platform/functions/'.$f.'/invocations?projectId='.$p,null,['data' => ['items' => [$invocation],'nextCursor' => null]],fn ($c) => $c->functions->invocations->list($f),['items' => [$invocation],'nextCursor' => null]],
 ['GET','/platform/functions/'.$f.'/invocations/'.$i.'?projectId='.$p,null,['data' => $invocation],fn ($c) => $c->functions->invocations->retrieve($f, $i),$invocation],
 ['POST','/platform/functions/'.$f.'/invocations',['request' => $request,'trigger' => 'test','projectId' => $p],['data' => $invocationResult],fn ($c) => $c->functions->invocations->create($f, ['request' => $request,'trigger' => 'test'], new Polymorfa\RequestOptions(idempotencyKey:'function_fixture')),$invocationResult],
];
nativeCases($cases, fn ($credential, $url) => (new Polymorfa\Client($credential, baseUrl:$url))->project($p));
$guard = (new Polymorfa\Client($credential))->project($p);
foreach ([
 fn () => $guard->functions->retrieve('INVALID'),
 fn () => $guard->functions->update($f, ['expectedRevision' => 0]),
 fn () => $guard->functions->create(['name' => 'Handler','projectId' => 'other']),
 fn () => $guard->functions->invocations->create($f, ['request' => $request], new Polymorfa\RequestOptions()),
 fn () => $guard->functions->invocations->create($f, ['request' => $request], new Polymorfa\RequestOptions(idempotencyKey:'with spaces')),
] as $invoke) {
    $error = raises($invoke, Polymorfa\ValidationException::class);
    check($error->errorCode === 'invalid_function_input', 'Functions validation code');
}
$history = [];
$guard = (new Polymorfa\Client($credential, http:mocked([jsonResponse(['error' => ['code' => 'unknown_outcome']], 503)], $history)))->project($p);
raises(fn () => $guard->functions->create(['name' => 'Handler'], new Polymorfa\RequestOptions(idempotencyKey:'write_key', maxNetworkRetries:3)), Polymorfa\ServerException::class);
check(count($history) === 1,'Functions write is never retried');
