<?php

declare(strict_types=1);

$ecConfigure = static function (array $fixture) use ($ecHttp, $ecUrl, $ecCredential): void {
    $ecHttp->post($ecUrl.'/__case', ['json' => $fixture + ['body' => null,'authorization' => $ecCredential->authorization(),'version' => '2026-09-22','response' => '{}']]);
};
$ecObserved = static fn (): array => json_decode((string)$ecHttp->get($ecUrl.'/__state')->getBody(), true, flags:JSON_THROW_ON_ERROR);
$ecPrincipals = [$ecCredential,Polymorfa\Credential::projectToken('pmfa_pt_'.str_repeat('a', 93).'A'),Polymorfa\Credential::clientToken('pmfa_ct_fixture')];
$ecCapabilities = ['status' => 'unknown','syncedAt' => null,'checkedAt' => null,'capabilities' => [['key' => 'polls.endTime','kind' => 'feature','unit' => null,'value' => null,'source' => null],['key' => 'polls.creatorEdit','kind' => 'feature','unit' => null,'value' => false,'source' => 'client_default']]];
foreach ($ecPrincipals as $principal) {
    $client = new Polymorfa\MessagingClient($principal, baseUrl:$ecUrl);
    $r = $ecRun('GET', '/messaging/name%20one/groups/group%40g.us/capabilities', null, ['success' => true,'data' => $ecCapabilities], fn () => $client->groups->getCapabilities('name one', 'group@g.us'), ['authorization' => $principal->authorization()]);
    ecCheck($r->data['data']['capabilities'][0]['value'] === null && $r->data['data']['capabilities'][1]['value'] === false, 'Group nullable capability and Client support');
}
$ecPhone = ['session' => 's','phone' => '+15555555555','online' => false,'devices' => [['deviceId' => 1],['deviceId' => 99]]];
$ecTestingPath = '/messaging/testing/'.$ecProject.'/numbers/s/phone';
$ecNine = [
 ['getGroupCapabilities','GET','/messaging/s/groups/g/capabilities',null,['success' => true,'data' => $ecCapabilities],fn (?Polymorfa\RequestOptions $o = null) => $ecMessaging->groups->getCapabilities('s', 'g', $o),200,'2026-09-22'],
 ['getTestingPhone','GET',$ecTestingPath,null,$ecPhone,fn (?Polymorfa\RequestOptions $o = null) => $ecMessaging->testing->getPhone($ecProject, 's', $o),200,'2026-09-22'],
 ['sendTestingPhoneMessage','POST',$ecTestingPath.'/messages',['to' => '+15555555555','text' => 'hello'],['session' => 's','to' => '+15555555555','messageId' => null],fn (?Polymorfa\RequestOptions $o = null) => $ecMessaging->testing->sendPhoneMessage($ecProject, 's', ['to' => '+15555555555','text' => 'hello'], $o),202,'2026-09-22'],
 ['unlinkTestingPhoneDevice','POST',$ecTestingPath.'/devices/99/unlink',null,['session' => 's','deviceId' => 99,'unlinked' => true],fn (?Polymorfa\RequestOptions $o = null) => $ecMessaging->testing->unlinkPhoneDevice($ecProject, 's', 99, $o),200,'2026-09-22'],
 ['retryHistoryChunk','POST','/messaging/s/history/chunks/retry',['syncType' => 'FULL','chunkOrder' => 0,'regenerate' => false],['success' => true,'data' => ['requestId' => 'native-retry','status' => 'requested']],fn (?Polymorfa\RequestOptions $o = null) => $ecMessaging->historySync->requestChunkRetry('s', ['syncType' => 'FULL','chunkOrder' => 0,'regenerate' => false], $o),200,'2026-10-14'],
 ['deleteHistoryMedia','POST','/messaging/s/history/media/delete',['directPath' => '/mms/history/file','fileEncSha256' => '//////////////////////////////////////////8=','encHandle' => 'handle','companionMetaNonce' => 'nonce'],['success' => true,'data' => ['status' => 'deleted']],fn (?Polymorfa\RequestOptions $o = null) => $ecMessaging->historySync->deleteChunk('s', '/mms/history/file', str_repeat("\xff", 32), 'handle', 'nonce', $o),200,'2026-10-14'],
];
foreach ($ecNine as [$name,$method,$path,$body,$result,$invoke,$status,$version]) {
    $r = $ecRun($method, $path, $body, $result, $invoke, ['status' => $status,'version' => $version,'headers' => ['X-Trace-Id' => 'trace','Idempotent-Replayed' => 'false','Set-Cookie' => 'never-export']]);
    ecCheck($r->data === $result && !isset($r->metadata->headers['set-cookie']) && $r->metadata->headers['idempotent-replayed'] === 'false', $name.' independent response and safe metadata');
    $ecRun($method, $path, $body, $result, fn () => $invoke(new Polymorfa\RequestOptions(apiVersion:'2026-09-22')), ['status' => $status]);
    foreach (['null','[]','{}','{"data":[]}','{"success":false,"data":{}}','{"broken"'] as $raw) {
        $ecConfigure(['method' => $method,'path' => $path,'body' => $body,'version' => $version,'status' => $status,'response' => $raw]);
        ecRaises(fn () => $invoke(new Polymorfa\RequestOptions(maxNetworkRetries:0)), Polymorfa\ServerException::class);
    }
    $ecConfigure(['method' => $method,'path' => $path,'body' => $body,'version' => $version,'status' => 409,'response' => '{"error":{"code":"future_nine_code","message":"Denied","param":"body.field"}}','headers' => ['X-Trace-Id' => 'trace','Idempotent-Replayed' => 'true','Content-Disposition' => 'attachment','Set-Cookie' => 'private']]);
    $error = ecRaises(fn () => $invoke(new Polymorfa\RequestOptions(maxNetworkRetries:0)), Polymorfa\PolymorfaException::class);
    ecCheck($error->errorCode === 'future_nine_code' && $error->param === 'body.field' && $error->metadata->headers['x-trace-id'] === 'trace' && !isset($error->metadata->headers['set-cookie']), $name.' unknown code/param/safe error metadata');
    $token = new Polymorfa\CancellationToken();
    $token->cancel();
    $before = count($ecObserved());
    ecRaises(fn () => $invoke(new Polymorfa\RequestOptions(cancellation:$token)), Polymorfa\CancelledException::class);
    ecCheck(count($ecObserved()) === $before, $name.' cancellation before HTTP');
}
foreach ([0,4294967295] as $order) {
    foreach (['INITIAL_BOOTSTRAP','INITIAL_STATUS_V3','FULL','RECENT','PUSH_NAME','NON_BLOCKING_DATA','ON_DEMAND'] as $sync) {
        $ecRun('POST', '/messaging/s/history/chunks/retry', ['syncType' => $sync,'chunkOrder' => $order], ['success' => true,'data' => ['requestId' => 'native-retry','status' => 'requested']], fn () => $ecMessaging->historySync->requestChunkRetry('s', ['syncType' => $sync,'chunkOrder' => $order]), ['version' => '2026-10-14']);
    }
}
foreach (['retry','delete'] as $kind) {
    $row = $ecNine[$kind === 'retry' ? 4 : 5];
    [, $method,$path,$body,$result,$invoke,,$version] = $row;
    foreach ([204,201] as $status) {
        $ecConfigure(['method' => $method,'path' => $path,'body' => $body,'version' => $version,'status' => $status,'response' => json_encode($result)]);
        ecRaises($invoke, Polymorfa\ServerException::class);
    }
    foreach ([['success' => false,'data' => $result['data']],['data' => $result['data']],$result['data'],['success' => true,'data' => null],['success' => true,'data' => []]] as $bad) {
        $ecConfigure(['method' => $method,'path' => $path,'body' => $body,'version' => $version,'response' => json_encode($bad)]);
        ecRaises($invoke, Polymorfa\ServerException::class);
    }
}
$ecLog = ['id' => '1234567890123456789','projectId' => $ecProject,'createdAt' => '2026-10-16T00:00:00Z','method' => 'POST','route' => '/messaging/:session/messages/send','status' => null,'durationMs' => 0,'result' => 'failure','source' => 'api','requestId' => null,'traceId' => 'trace','errorCode' => 'future','mcpTool' => null,'credential' => null];
foreach ([$ecA,$ecB,$ecA] as $view) {
    $selected = $view === $ecA ? $ecProject : $ecBProject;
    $log = array_replace($ecLog, ['projectId' => $selected]);
    $r = $ecRun('GET', '/platform/projects/'.$selected.'/request-logs?limit=1&cursor=next', null, ['data' => [$log],'page' => ['nextCursor' => null,'hasMore' => false,'followCursor' => 'follow']], fn () => $view->requestLogs->list(['cursor' => 'next','limit' => 1]));
    ecCheck($r->items === [$log] && $r->items[0]['id'] === '1234567890123456789' && $r->nextCursor === null, 'RequestLogPage identity and nullable data');
}
$ecRun('GET', '/platform/projects/'.$ecProject.'/request-logs?traceId=trace', null, ['data' => [$ecLog],'page' => ['nextCursor' => null,'hasMore' => false,'followCursor' => 'follow']], fn () => $ecOrg->requestLogs->list(['projectId' => $ecProject,'traceId' => 'trace']));
// Independent Node-authored encryption vectors. SDK serializers never make expected bytes.
$ecVectors = json_decode((string)file_get_contents(__DIR__.'/fixtures/php41-media-vectors.json'), true, flags:JSON_THROW_ON_ERROR)['fixtures'];
foreach ($ecPrincipals as $principal) {
    $client = new Polymorfa\MessagingClient($principal, baseUrl:$ecUrl);
    foreach ($ecVectors as $v) {
        $kind = $v['kind'];
        $type = match($kind) {
            'audio','ptt' => 'voice','document' => 'file',default => $kind
        };
        $hash = hex2bin($v['fileEncSha256']);
        $urlHash = rtrim(strtr(base64_encode($hash), '+/', '-_'), '=');
        $query = 'type='.$type.'&fileEncSha256='.rawurlencode($urlHash).(in_array($kind, ['audio','ptt'], true) ? '&ptt='.($kind === 'ptt' ? 'true' : 'false') : '');
        $encrypted = hex2bin($v['encrypted']);
        $ecConfigure(['method' => 'POST','path' => '/messaging/s/media/uploads?'.$query,'bodySha256' => hash('sha256', $encrypted),'maxBodyBytes' => strlen($encrypted),'requestHeaders' => ['content-length' => (string)strlen($encrypted),'content-type' => 'application/octet-stream'],'authorization' => $principal->authorization(),'version' => '2026-10-14','response' => '{"success":true,"data":{"url":"https://mmg.whatsapp.net/mms/file","directPath":"/mms/file","handle":"h"}}']);
        $r = $client->whatsappMedia->uploadBytes('s', hex2bin($v['plaintext']), new Polymorfa\UploadWhatsAppMediaOptions($kind, mediaKey:hex2bin($v['mediaKey'])));
        ecCheck($r->info->fileEncSha256 === $hash && $r->location->directPath === '/mms/file', 'All-principal relay '.$kind.' hash/content-length/EOF');
        ++$ecCount;
        if ($principal->kind !== 'client_token') {
            $grant = ['type' => $type,'fileEncSha256' => $urlHash];
            if ($type === 'voice') {
                $grant['ptt'] = $kind === 'ptt';
            }
            $ecConfigure(['method' => 'POST','path' => '/messaging/s/media/upload-grants','body' => $grant,'authorization' => $principal->authorization(),'version' => '2026-10-14','response' => '{"success":true,"data":{"host":"mmg.whatsapp.net","uploadUrl":"https://mmg.whatsapp.net/mms/file?auth=fixture","expiresAt":1792100000}}']);
            $g = $client->whatsappMedia->createUploadGrant('s', $kind, $hash);
            ecCheck($g->host === 'mmg.whatsapp.net' && $g->expiresAt === 1792100000, 'Public grant mapping '.$kind);
            ++$ecCount;
        }
    }
}
// Handwritten sticker input. The returned resource id is a producer-valid 19-digit string.
foreach ([false,true] as $animated) {
    $descriptor = new Polymorfa\WhatsAppMediaSendDescriptor('sticker', '/mms/sticker/file', 'https://mmg.whatsapp.net/mms/sticker/file', str_repeat('k', 32), str_repeat('h', 32), str_repeat('e', 32), 19, 'image/webp', new Polymorfa\WhatsAppMediaSendMetadata(width:512, height:512, isAnimated:$animated));
    $wire = ['directPath' => '/mms/sticker/file','url' => 'https://mmg.whatsapp.net/mms/sticker/file','mediaKey' => base64_encode(str_repeat('k', 32)),'fileSha256' => base64_encode(str_repeat('h', 32)),'fileEncSha256' => base64_encode(str_repeat('e', 32)),'fileLength' => 19,'mimeType' => 'image/webp','width' => 512,'height' => 512,'isAnimated' => $animated];
    $sent = ['id' => '1234567890123456789','whatsapp_ids' => ['linked_devices' => 'native-message'],'conversation' => ['id' => 'chat'],'timestamp' => '2026-10-16T00:00:00Z','status' => 'sent','type' => 'sticker','content' => ['sticker' => ['descriptor' => $wire]]];
    $r = $ecRun('POST', '/messaging/s/messages/send', ['conversation' => ['id' => 'chat'],'content' => ['sticker' => ['descriptor' => $wire]]], ['success' => true,'data' => $sent], fn () => $ecMessaging->messages->send('s', ['conversation' => ['id' => 'chat'],'content' => ['sticker' => ['descriptor' => $descriptor]]]), ['version' => '2026-10-14']);
    ecCheck($r->data['data']['id'] === '1234567890123456789' && $r->data['data']['content']['sticker']['descriptor']->metadata->isAnimated === $animated, 'Sticker typed response/binary fields/id');
}
$ecStickerWire = $wire;
$ecStickerSent = $sent;
$ecStickerDescriptor = $descriptor;
// Descriptor bodies follow the strict producer schema; envelope extensions remain raw.
// Independent signed native shapes: archive, Cloud, descriptor media, descriptor inline.
$common = ['delivery' => 'descriptor','whatsapp_ids' => ['linked_devices' => 'chunk-identity'],'original_whatsapp_ids' => ['linked_devices' => 'original-identity'],'syncType' => 'FUTURE_SYNC','fileLength' => 0,'chunkOrder' => 4294967296,'progress' => 0,'oldestMessageAt' => '2026-10-16T00:00:00Z'];
$media = ['type' => 'md-msg-hist','directPath' => '/history/chunk','mediaKey' => 'opaque-key','fileSha256' => 'opaque-hash','fileEncSha256' => 'opaque-encrypted-hash'];
$inline = ['encoding' => 'zlib-base64-protobuf','data' => 'eA=='];
foreach ([['kind' => 'history','value' => ['provider' => []]],['whatsapp_ids' => ['linked_devices' => 'archive'],'mode' => 'deliver','syncType' => 'FULL','fileLength' => 0,'messages' => [],'conversationCount' => 0,'messageCount' => 0,'pushNameCount' => 0,'statusMessageCount' => 0,'whatsapp' => ['encoding' => 'gzip-base64-protobuf','data' => 'opaque']],$common + ['media' => $media],$common + ['inline' => $inline]] as $payload) {
    $envelope = ['id' => 'event-uuid','session' => 's','timestamp' => '2026-10-16T00:00:00Z','event' => 'history.sync','payload' => $payload,'future' => false];
    $raw = json_encode($envelope, JSON_THROW_ON_ERROR);
    $event = Polymorfa\Webhooks::constructEvent($raw, hash_hmac('sha256', $raw, 'fixture-secret'), 'fixture-secret');
    ecCheck($event->knownEvent() === $envelope && $event->raw['future'] === false, 'Signed history family and forward fields');
}
foreach ([$common,$common + ['media' => $media,'inline' => $inline],$common + ['media' => []],array_replace($common, ['progress' => 101,'inline' => $inline]),array_replace($common, ['fileLength' => -1,'inline' => $inline])] as $payload) {
    $raw = json_encode(['id' => 'event','session' => 's','timestamp' => 'now','event' => 'history.sync','payload' => $payload], JSON_THROW_ON_ERROR);
    ecRaises(fn () => Polymorfa\Webhooks::constructEvent($raw, hash_hmac('sha256', $raw, 'fixture-secret'), 'fixture-secret'), Polymorfa\ValidationException::class);
}
