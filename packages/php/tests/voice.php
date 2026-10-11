<?php

declare(strict_types=1);
$asset = ['id' => 'a1','projectId' => 'p1','name' => 'Greeting','source' => 'tts','status' => 'ready','failureReason' => null,'originalFormat' => 'wav','originalContentType' => 'audio/wav','sizeBytes' => 3,'durationMs' => 1200.5,'contentSha256' => 'hash','tts' => ['provider' => 'openai','voiceId' => 'alloy','model' => 'tts-1','text' => 'Hello','characters' => 5,'keySource' => 'managed','credentialId' => null],'retentionDays' => null,'expiresAt' => null,'inUseCount' => 0,'revision' => 2,'createdAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:00Z','readyAt' => '2026-10-11T00:00:00Z'];
$provider = ['id' => 'key1','projectId' => null,'provider' => 'openai','label' => 'Provider','keyFingerprint' => '12345678','status' => 'valid','verifiedAt' => null,'lastError' => null,'revision' => 2,'createdAt' => '2026-10-11T00:00:00Z','updatedAt' => '2026-10-11T00:00:00Z'];
$upload = ['asset' => $asset,'upload' => ['url' => 'https://storage.example/audio','method' => 'POST','headers' => ['x-fixture' => 'audio'],'maxBytes' => 16777216,'expiresAt' => '2026-10-11T00:05:00Z']];
$deleted = ['id' => 'a1','deleted' => true];
$preview = ['url' => 'https://storage.example/preview','contentType' => 'audio/ogg','expiresAt' => '2026-10-11T00:05:00Z'];
$cases = [
 ['GET','/platform/voice/audio?projectId=p1&status=ready&limit=2',null,['data' => [$asset],'page' => ['nextCursor' => null]],fn ($c) => $c->audio->list(params:['status' => 'ready','limit' => 2])->response],
 ['POST','/platform/voice/audio',['name' => 'Greeting','contentType' => 'audio/wav','sizeBytes' => 3,'projectId' => 'p1'],['data' => $upload],fn ($c) => $c->audio->createUpload(['name' => 'Greeting','contentType' => 'audio/wav','sizeBytes' => 3]),$upload],
 ['POST','/platform/voice/audio/tts',['name' => 'Greeting','text' => 'Hello','provider' => 'openai','voiceId' => 'alloy','projectId' => 'p1'],['data' => $asset],fn ($c) => $c->audio->synthesize(['name' => 'Greeting','text' => 'Hello','provider' => 'openai','voiceId' => 'alloy']),$asset],
 ['GET','/platform/voice/audio/a1',null,['data' => $asset],fn ($c) => $c->audio->retrieve('a1'),$asset],
 ['POST','/platform/voice/audio/a1/complete',null,['data' => $asset],fn ($c) => $c->audio->complete('a1'),$asset],
 ['PATCH','/platform/voice/audio/a1',['expectedRevision' => 1,'retentionDays' => null],['data' => $asset],fn ($c) => $c->audio->update('a1', ['expectedRevision' => 1,'retentionDays' => null]),$asset],
 ['DELETE','/platform/voice/audio/a1',null,['data' => $deleted],fn ($c) => $c->audio->delete('a1'),$deleted],
 ['GET','/platform/voice/audio/a1/preview',null,['data' => $preview],fn ($c) => $c->audio->previewUrl('a1'),$preview],
 ['GET','/platform/voice/provider-credentials?projectId=p1',null,['data' => [$provider]],fn ($c) => $c->providerCredentials->list(),[$provider]],
 ['POST','/platform/voice/provider-credentials',['provider' => 'openai','label' => 'Provider','apiKey' => 'synthetic-fixture','projectId' => 'p1'],['data' => $provider],fn ($c) => $c->providerCredentials->create(['provider' => 'openai','label' => 'Provider','apiKey' => 'synthetic-fixture']),$provider],
 ['GET','/platform/voice/provider-credentials/key1',null,['data' => $provider],fn ($c) => $c->providerCredentials->retrieve('key1'),$provider],
 ['POST','/platform/voice/provider-credentials/key1/verify',null,['data' => $provider],fn ($c) => $c->providerCredentials->verify('key1'),$provider],
 ['DELETE','/platform/voice/provider-credentials/key1',null,['data' => ['id' => 'key1','deleted' => true]],fn ($c) => $c->providerCredentials->delete('key1'),['id' => 'key1','deleted' => true]],
];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\Resources\Voice(new Polymorfa\HttpTransport($credential, $url), 'p1'));
$history = [];
$foreign = $asset;
$foreign['projectId'] = 'p2';
$voice = new Polymorfa\Resources\Voice(new Polymorfa\HttpTransport($credential, http:mocked([jsonResponse(['data' => $foreign])], $history)), 'p1', true);
raises(fn () => $voice->audio->delete('a1'), Polymorfa\NotFoundException::class);
check(count($history) === 1, 'Foreign Voice write stopped at project read');
$history = [];
$voice = new Polymorfa\Resources\Voice(new Polymorfa\HttpTransport($credential, http:mocked([jsonResponse(['data' => $provider])], $history)), 'p1', true);
raises(fn () => $voice->providerCredentials->verify('key1'), Polymorfa\AuthorizationException::class);
check(count($history) === 1, 'Team-wide credential read only in project view');
$history = [];
$failed = $asset;
$failed['status'] = 'failed';
$failed['failureReason'] = 'silent';
$voice = new Polymorfa\Resources\Voice(new Polymorfa\HttpTransport($credential, http:mocked([jsonResponse(['data' => $failed])], $history)), 'p1');
check($voice->audio->waitUntilReady('a1', timeout:1, interval:0)->data['status'] === 'failed', 'Failed Voice asset is terminal');
raises(fn () => $voice->audio->waitUntilReady('a1', timeout:0), Polymorfa\TimeoutException::class);
$caller = new Polymorfa\CancellationToken();
$caller->cancel();
raises(fn () => $voice->audio->waitUntilReady('a1', cancellation:$caller), Polymorfa\CancelledException::class);
$linked = Polymorfa\CancellationToken::linked($caller, Polymorfa\CancellationToken::after(100));
check($linked->isCancelled(), 'Linked cancellation observes parent');
$history = [];
$storageHistory = [];
$voice = new Polymorfa\Resources\Voice(new Polymorfa\HttpTransport($credential, http:mocked([jsonResponse(['data' => $upload]),jsonResponse(['data' => $asset])], $history)), 'p1', false, mocked([new GuzzleHttp\Psr7\Response(200)], $storageHistory));
$body = fopen('php://memory', 'r+');
fwrite($body, 'abc');
rewind($body);
check($voice->audio->upload(['name' => 'Greeting','contentType' => 'audio/wav','sizeBytes' => 3], $body, options:new Polymorfa\RequestOptions(idempotencyKey:'asset-key'))->data === $asset, 'Voice stream upload completes');
fclose($body);
check(count($history) === 2 && $history[0]['request']->getHeaderLine('idempotency-key') === 'asset-key' && $history[1]['request']->getHeaderLine('idempotency-key') === '', 'Voice completion uses fresh API command');
check(count($storageHistory) === 1 && $storageHistory[0]['request']->getHeaderLine('authorization') === '' && $storageHistory[0]['request']->getHeaderLine('idempotency-key') === '' && (string)$storageHistory[0]['request']->getBody() === 'abc', 'Voice upload separate credential-free binary transport');
$history = [];
$voice = new Polymorfa\Resources\Voice(new Polymorfa\HttpTransport($credential, http:mocked([], $history)), 'p1');
raises(fn () => $voice->audio->upload(['name' => 'Greeting','contentType' => 'audio/wav','sizeBytes' => 3], 'ab'), Polymorfa\ValidationException::class);
check($history === [], 'Mismatched bytes refused before admission');

$pair = stream_socket_pair(STREAM_PF_UNIX, STREAM_SOCK_STREAM, STREAM_IPPROTO_IP);
raises(fn () => $voice->audio->upload(['name' => 'Greeting','contentType' => 'audio/wav','sizeBytes' => 3], $pair[0], options:new Polymorfa\RequestOptions(timeout:0.03)), Polymorfa\TimeoutException::class);
check(stream_get_meta_data($pair[0])['blocked'] === true, 'Audio stream blocking mode restored after timeout');
fclose($pair[0]);
fclose($pair[1]);
check($history === [], 'Stalled audio input timed out before admission');
$process = proc_open([PHP_BINARY,__DIR__.'/voice-storage-server.php'], [0 => ['pipe','r'],1 => ['pipe','w'],2 => ['pipe','w']], $pipes);
try {
    $ready = json_decode(fgets($pipes[1]), true, flags:JSON_THROW_ON_ERROR);
    $target = $upload;
    $target['upload']['url'] = $ready['url'];
    $history = [];
    $voice = new Polymorfa\Resources\Voice(new Polymorfa\HttpTransport($credential, http:mocked([jsonResponse(['data' => $target]),jsonResponse(['data' => $asset])], $history)), 'p1', false, new GuzzleHttp\Client(['verify' => false]));
    check($voice->audio->upload(['name' => 'Greeting','contentType' => 'audio/wav','sizeBytes' => 3], 'abc')->data === $asset, 'Native HTTPS audio upload completes');
    check(json_decode(fgets($pipes[1]),true,flags:JSON_THROW_ON_ERROR)['valid'] === true,'Native HTTPS audio request has only storage headers');
} finally {
    foreach ($pipes as $pipe) {
        fclose($pipe);
    } proc_terminate($process);
    proc_close($process);
}
