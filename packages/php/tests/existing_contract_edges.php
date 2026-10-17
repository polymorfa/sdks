<?php

declare(strict_types=1);

$ecNoIO = static function (callable $invoke, string $type = Polymorfa\ConfigurationException::class) use ($ecObserved): void {
    $before = count($ecObserved());
    ecRaises($invoke, $type);
    ecCheck(count($ecObserved()) === $before, 'Invalid input refused before HTTP');
};
foreach (["\u{00a0}", "\u{feff}"] as $space) {
    $ecNoIO(fn () => $ecMessaging->campaigns->create('slug', ['name' => 'Draft', 'followUp' => ['message' => ['type' => 'text', 'text' => '{{'.$space.'LiNk:a}}']]]));
    $ecNoIO(fn () => $ecMessaging->campaigns->create('slug', ['name' => 'Draft', 'trackedLinks' => [['key' => 'a', 'url' => 'https://example.com/'.$space]]]));
}
foreach ([['variableMapping' => null],['variableMapping' => ['bad key' => []]],['variableMapping' => array_fill_keys(range(0, 50), [])],['variableMapping' => ['0' => ['source' => null]]],['variableMapping' => ['0' => ['fallback' => null]]],['variableMapping' => ['0' => ['future' => true]]],['variableMapping' => ['0' => ['fallback' => "\xef\xbb\xbf"]]],['variableMapping' => ['0' => ['fallback' => str_repeat('😀', 513)]]],['trackedLinks' => array_fill(0, 6, ['key' => 'a','url' => 'https://example.com'])],['trackedLinks' => [['key' => 'a','url' => 'https://example.com'],['key' => 'a','url' => 'https://elsewhere.com']]],['trackedLinks' => [['key' => 'A','url' => 'https://example.com']]],['trackedLinks' => [['key' => 'a','url' => 'http://example.com']]],['trackedLinks' => [['key' => 'a','url' => 'https://u:p@example.com']]],['trackedLinks' => [['key' => 'a','url' => 'https://127.0.0.1']]],['trackedLinks' => [['key' => 'a','url' => 'https://foo.local']]],['trackedLinks' => [['key' => 'a','url' => 'https://example.com/'.str_repeat('😀', 200)]]],['followUp' => ['delaySeconds' => 604800,'message' => ['type' => 'text','text' => 'x']]],['followUp' => ['expirySeconds' => 86400,'message' => ['type' => 'text','text' => 'x']]],['followUp' => ['message' => ['type' => 'text','text' => '{{ LiNk:a }}']]],['followUp' => ['message' => ['type' => 'template','templateId' => 'not-uuid']]]] as $bad) {
    $ecNoIO(fn () => $ecMessaging->campaigns->create('slug', ['name' => 'Draft'] + $bad));
}
foreach ([['messagesArray' => array_fill(0, 11, [])],['messagesArray' => [['delayAfterSec' => 86401]]],['messagesArray' => [['version' => 3]]],['messagesArray' => [['media' => ['url' => 'x']]]],['messagesArray' => [['buttons' => [['kind' => 'reply']]]]],['messageVariations' => null],['variants' => null],['variantStrategy' => null]] as $bad) {
    $ecNoIO(fn () => $ecOrg->campaigns->create(['projectId' => $ecProject,'name' => 'Draft'] + $bad));
}
foreach ([['projectId' => $ecProject,'skipMissingVariables' => false,'extra' => 0],['skipMissingVariables' => true],['projectId' => $ecProject,'scheduledAt' => null]] as $bad) {
    $ecNoIO(fn () => $ecOrg->campaigns->launch($ecId, $bad));
}
foreach ([['projectId' => $ecBProject], ['projectId' => null], ['id' => 'foreign'], ['id' => null]] as $bad) {
    $ecNoIO(fn () => $ecOrg->campaigns->update($ecId, $bad, ['projectId' => $ecProject]));
}
$ecNoIO(fn () => $ecMessaging->campaigns->update('slug', $ecId, []));
foreach ([['reason' => 'invented'],['reason' => null],['limit' => 0],['limit' => 101],['cursor' => str_repeat('x', 257)],['status' => 'unknown'],['extra' => true]] as $params) {
    $ecNoIO(fn () => $ecMessaging->campaigns->listRecipients('slug', $ecId, $params));
}
foreach (['opted_out','cold_held','campaign_cancelled','invalid_recipient','session_not_connected','ack_timeout','blocked_by_safety','send_failed','missing_variable','other'] as $reason) {
    $ecRun('GET', $ecPath.'/recipients?reason='.$reason, null, ['success' => true,'data' => [],'page' => $ecPage], fn () => $ecMessaging->campaigns->listRecipients('slug', $ecId, ['reason' => $reason]));
}
foreach ([['purpose' => 'initial','session' => 's'],['purpose' => 'initial','addConnection' => 'linked_devices'],['purpose' => 'add_connection','session' => 's'],['purpose' => 'add_connection','session' => 's','addConnection' => 'linked_devices','signalMode' => 'standard'],['purpose' => 'add_connection','session' => 's','addConnection' => 'linked_devices','customerId' => null],['purpose' => 'add_connection','session' => 's','addConnection' => 'linked_devices','connectionGoal' => 'single'],['signalMode' => null],['signalMode' => 'unknown'],['configuration' => ['historySync' => ['delivery' => 'archive']]],['configuration' => ['historySync' => ['delivery' => null]]]] as $bad) {
    $ecNoIO(fn () => $ecMessaging->quickLinks->create($bad));
}
foreach (['signalMode','zeroKnowledge','signal_mode','signalModeDefault','signalRelay'] as $alias) {
    $ecNoIO(fn () => $ecMessaging->quickLinks->create(['configuration' => [$alias => false]]));
}
foreach ([['configuration' => ['set' => ['historySync' => ['delivery' => 'archive']]],'revision' => 0],['configuration' => ['set' => ['historySync' => ['delivery' => null]]],'revision' => 0],['configuration' => ['reset' => ['signalMode']],'revision' => 0],['configuration' => [],'revision' => 0,'projectId' => $ecBProject],['configuration' => [],'revision' => 0,'signalMode' => 'zero_knowledge']] as $bad) {
    $ecNoIO(fn () => $ecA->sessionConfiguration->update($bad));
    $ecNoIO(fn () => $ecMessaging->sessions->update('s', $bad));
}
foreach ([['sticker' => []],['sticker' => ['url' => 'https://example.com']]] as $content) {
    $ecNoIO(fn () => $ecMessaging->messages->send('s', ['conversation' => ['id' => 'chat'],'content' => $content]));
}
foreach ([['syncType' => 'FULL','chunkOrder' => -1],['syncType' => 'FULL','chunkOrder' => 4294967296],['syncType' => 'FULL','chunkOrder' => 0,'chunkMessageId' => null],['syncType' => 'FULL','chunkOrder' => 0,'regenerate' => null],['syncType' => 'UNKNOWN','chunkOrder' => 0],['syncType' => 'FULL','chunkOrder' => 0,'extra' => true]] as $bad) {
    $ecNoIO(fn () => $ecMessaging->historySync->requestChunkRetry('s', $bad));
}
foreach ([0,100] as $device) {
    $ecNoIO(fn () => $ecMessaging->testing->unlinkPhoneDevice($ecProject, 's', $device), Polymorfa\ValidationException::class);
}
$ecNoIO(fn () => $ecOrg->requestLogs->list());
$ecNoIO(fn () => $ecA->requestLogs->list(['projectId' => $ecBProject]), Polymorfa\ValidationException::class);
$ecNoIO(fn () => $ecA->requestLogs->list(['cursor' => 'next','traceId' => 'trace']), Polymorfa\ValidationException::class);
$ecBrowser = new Polymorfa\MessagingClient($ecPrincipals[2], baseUrl:$ecUrl);
foreach ([fn () => $ecBrowser->testing->getPhone($ecProject, 's'),fn () => $ecBrowser->testing->sendPhoneMessage($ecProject, 's', ['to' => 'x','text' => 'y']),fn () => $ecBrowser->testing->unlinkPhoneDevice($ecProject, 's', 1),fn () => $ecBrowser->historySync->requestChunkRetry('s', ['syncType' => 'FULL','chunkOrder' => 0]),fn () => $ecBrowser->historySync->deleteChunk('s', '/file', str_repeat('h', 32)),fn () => $ecBrowser->whatsappMedia->createUploadGrant('s', 'image', str_repeat('h', 32)),fn () => $ecBrowser->whatsappMedia->uploadTransport('direct', new Polymorfa\UploadWhatsAppMediaOptions('image'))] as $invoke) {
    $ecNoIO($invoke);
}
$opens = 0;
$source = static function (?Polymorfa\CancellationToken $c) use (&$opens) {
    ++$opens;
    return GuzzleHttp\Psr7\Utils::streamFor('plain');
};
$ecNoIO(fn () => $ecBrowser->whatsappMedia->upload('s', $source, new Polymorfa\UploadWhatsAppMediaOptions('image', egress:'direct')));
ecCheck($opens === 0, 'Direct Client refusal precedes source/hash reads');
// Custom transport and a wrapper around the built-in relay retain scoped Client support.
$ecCustom = new class () implements Polymorfa\WhatsAppMediaUploadTransport {
    public function name(): string
    {
        return 'customer';
    }
    public function upload(string $session, Polymorfa\WhatsAppEncryptedUploadBody $body): Polymorfa\WhatsAppUploadLocation
    {
        $stream = $body->open();
        try {
            $stream->getContents();
        } finally {
            $stream->close();
        } return new Polymorfa\WhatsAppUploadLocation('/custom', 'https://example.com/custom');
    }
};
$r = $ecBrowser->whatsappMedia->uploadBytes('s', 'plain', new Polymorfa\UploadWhatsAppMediaOptions('image', uploadTransport:$ecCustom));
ecCheck($r->egress === 'customer', 'Client pure custom encrypted transport');
$ecRelay = $ecBrowser->whatsappMedia->uploadTransport('relay', new Polymorfa\UploadWhatsAppMediaOptions('image'));
$ecWrapper = new class ($ecRelay) implements Polymorfa\WhatsAppMediaUploadTransport {
    public function __construct(private Polymorfa\WhatsAppMediaUploadTransport $inner)
    {
    }
    public function name(): string
    {
        return 'wrapped-relay';
    }
    public function upload(string $session, Polymorfa\WhatsAppEncryptedUploadBody $body): Polymorfa\WhatsAppUploadLocation
    {
        return $this->inner->upload($session, $body);
    }
};
$v = $ecVectors[0];
$cipher = hex2bin($v['encrypted']);
$hash = hex2bin($v['fileEncSha256']);
$hashUrl = rtrim(strtr(base64_encode($hash), '+/', '-_'), '=');
$ecConfigure(['method' => 'POST','path' => '/messaging/s/media/uploads?type=image&fileEncSha256='.rawurlencode($hashUrl),'authorization' => $ecPrincipals[2]->authorization(),'version' => '2026-10-14','bodySha256' => hash('sha256', $cipher),'maxBodyBytes' => strlen($cipher),'response' => '{"data":{"directPath":"/wrapped","url":"https://mmg.whatsapp.net/wrapped"}}']);
$r = $ecBrowser->whatsappMedia->uploadBytes('s', hex2bin($v['plaintext']), new Polymorfa\UploadWhatsAppMediaOptions('image', mediaKey:hex2bin($v['mediaKey']), uploadTransport:$ecWrapper));
ecCheck($r->location->directPath === '/wrapped', 'Client wrapped built-in relay');
// Required null means present null. Absence and arrays in object positions are invalid.
foreach (['trackedLinks','experimentOutcome','followUp'] as $field) {
    $bad = $ecCampaign;
    unset($bad[$field]);
    $ecConfigure(['method' => 'GET','path' => $ecPath,'response' => json_encode(['success' => true,'data' => $bad])]);
    ecRaises(fn () => $ecMessaging->campaigns->retrieve('slug', $ecId), Polymorfa\ServerException::class);
}
foreach ([['variableMapping' => []],['variableMapping' => (object)['0' => ['source' => null]]],['trackedLinks' => (object)[]],['followUp' => []]] as $change) {
    $ecConfigure(['method' => 'GET','path' => $ecPath,'response' => json_encode(['success' => true,'data' => array_replace($ecCampaign, $change)])]);
    ecRaises(fn () => $ecMessaging->campaigns->retrieve('slug', $ecId), Polymorfa\ServerException::class);
}
foreach (['averageResponseTimeMs','minResponseTimeMs','maxResponseTimeMs','experiment','followUps'] as $field) {
    $bad = $ecReport;
    unset($bad[$field]);
    $ecConfigure(['method' => 'GET','path' => $ecPath.'/analytics','response' => json_encode(['success' => true,'data' => $bad])]);
    ecRaises(fn () => $ecMessaging->campaigns->analytics('slug', $ecId), Polymorfa\ServerException::class);
}
foreach (['failureReason','nextMessageAt','messagesSent','sequenceError','followUp'] as $field) {
    $bad = $ecRecipient;
    unset($bad[$field]);
    $ecConfigure(['method' => 'GET','path' => $ecPath.'/recipients','response' => json_encode(['success' => true,'data' => [$bad],'page' => $ecPage])]);
    ecRaises(fn () => $ecMessaging->campaigns->listRecipients('slug', $ecId), Polymorfa\ServerException::class);
}
$ecNoIO(fn () => $ecMessaging->campaigns->launch('slug', $ecId, [], new Polymorfa\RequestOptions(headers:['Idempotency-Key' => 'forbidden'])));
// Caller-authorized retries keep a captured body even when the caller mutates references.
$ecAudience = ['id' => $ecId,'name' => 'Audience','source' => 'api','recipientCount' => 0,'fileId' => null,'columns' => null,'sampleRow' => null,'mapping' => null,'createdAt' => 0,'updatedAt' => 0,'duplicateCount' => 0,'invalidCount' => 0,'invalidRows' => []];
$ecAppendBody = ['recipients' => [['phone' => '+15555555555','variables' => ['x' => false]]]];
$ecAudienceBody = ['name' => 'Audience','source' => 'api','members' => [['phone' => '+15555555555','variables' => ['x' => false]]]];
$ecMemberBody = ['members' => [['phone' => '+15555555555','variables' => ['x' => false]]]];
$ecReplayRows = [['POST',$ecPath.'/recipients',$ecAppendBody,['success' => true,'data' => $ecAdded],fn ($c, $b, $o) => $c->campaigns->addRecipients('slug', $ecId, $b, $o),'messaging'],['POST',$ecPlatform.'/recipients',['projectId' => $ecProject] + $ecAppendBody,['data' => $ecAdded],fn ($c, $b, $o) => $c->campaigns->addRecipients($ecId, $b, $o),'organization'],['POST','/platform/audiences',$ecAudienceBody,['data' => $ecAudience],fn ($c, $b, $o) => $c->audiences->create($b, $o),'organization'],['POST','/platform/audiences/'.$ecId.'/members',$ecMemberBody,['data' => ['listId' => $ecId,'added' => 0,'recipientCount' => 0,'duplicateCount' => 0,'invalidCount' => 0,'invalidRows' => []]],fn ($c, $b, $o) => $c->audiences->addMembers($ecId, $b, $o),'organization']];
foreach ($ecReplayRows as [$method,$path,$body,$result,$call,$surface]) {
    $wire = $body;
    $list = array_key_exists('recipients', $wire) ? 'recipients' : 'members';
    $wire[$list][0]['variables'] = (object)['x' => false];
    foreach ([null,'caller-key'] as $key) {
        $client = $surface === 'messaging' ? $ecMessaging : $ecOrg;
        $ecConfigure(['method' => $method,'path' => $path,'body' => $wire,'statuses' => [503,200],'response' => json_encode($result),'headers' => ['Retry-After' => '0']]);
        if ($path === '/platform/audiences' && $key !== null) {
            $r = $call($client, $body, new Polymorfa\RequestOptions(idempotencyKey:$key));
            ecCheck($r->metadata->attempts === 2, 'Audience create retains ordinary keyed retries');
        } else {
            ecRaises(fn () => $call($client, $body, new Polymorfa\RequestOptions(idempotencyKey:$key)), Polymorfa\ServerException::class);
            ecCheck(count($ecObserved()) === 1, 'Unsafe default once without fabricated retry key');
        }
    }
    $original = $body;
    $mutator = new class (static function () use (&$body, $list): void {
        $body[$list][0]['variables']['x'] = true;
        $body[$list][0]['phone'] = '+15555555556';
    }) extends GuzzleHttp\Client {
        public function __construct(private Closure $mutate)
        {
            parent::__construct();
        }
        public function request(string $method, $uri = '', array $options = []): Psr\Http\Message\ResponseInterface
        {
            ($this->mutate)();
            return parent::request($method, $uri, $options);
        }
    };
    $client = $surface === 'messaging' ? new Polymorfa\MessagingClient($ecCredential, baseUrl:$ecUrl, http:$mutator) : new Polymorfa\Client($ecCredential, baseUrl:$ecUrl, http:$mutator);
    $ecConfigure(['method' => $method,'path' => $path,'body' => $wire,'statuses' => [503,200],'response' => json_encode($result),'headers' => ['Retry-After' => '0','X-Trace-Id' => 'trace','Idempotent-Replayed' => 'false']]);
    $r = $call($client, $body, new Polymorfa\RequestOptions(maxNetworkRetries:1, idempotencyKey:'caller-replay'));
    $requests = $ecObserved();
    ecCheck(count($requests) === 2 && $requests[0]['bodySha256'] === $requests[1]['bodySha256'] && $requests[0]['idempotencyKey'] === 'caller-replay' && $requests[1]['idempotencyKey'] === 'caller-replay' && $body !== $original, 'Explicit replay snapshot survives caller mutation');
    ++$ecCount;
    $ecConfigure(['method' => $method,'path' => $path,'body' => $wire,'status' => 409,'response' => '{"error":{"code":"campaign_approval_required","param":"variables"}}','headers' => ['Idempotent-Replayed' => 'true','X-Trace-Id' => 'trace']]);
    $e = ecRaises(fn () => $call($client, $original, new Polymorfa\RequestOptions(maxNetworkRetries:0, idempotencyKey:'caller-replay')), Polymorfa\ConflictException::class);
    ecCheck($e->errorCode === 'campaign_approval_required' && $e->metadata->headers['idempotent-replayed'] === 'true', 'Replay conflict known code/safe metadata');
}
// The remaining nine-route controls use actual HTTP, including public grant.
$ecLogPath = '/platform/projects/'.$ecProject.'/request-logs';
foreach (['{}','{"data":[{}],"page":{"nextCursor":null,"hasMore":false,"followCursor":"f"}}','{"data":[],"page":[]}','{"bad"'] as $raw) {
    $ecConfigure(['method' => 'GET','path' => $ecLogPath,'response' => $raw]);
    ecRaises(fn () => $ecA->requestLogs->list(), Polymorfa\ServerException::class);
}
$ecRun('GET', $ecLogPath, null, ['data' => [$ecLog],'page' => ['nextCursor' => null,'hasMore' => false,'followCursor' => 'f']], fn () => $ecA->requestLogs->list([], new Polymorfa\RequestOptions(apiVersion:'2026-10-14')), ['version' => '2026-10-14']);
$token = new Polymorfa\CancellationToken();
$token->cancel();
$before = count($ecObserved());
ecRaises(fn () => $ecA->requestLogs->list([], new Polymorfa\RequestOptions(cancellation:$token)), Polymorfa\CancelledException::class);
ecCheck(count($ecObserved()) === $before, 'Request logs cancellation');
$grantBody = ['type' => 'image','fileEncSha256' => rtrim(strtr(base64_encode(str_repeat('h', 32)), '+/', '-_'), '=')];
foreach (['null','[]','{"data":[]}','{"data":{"host":"attacker.invalid","uploadUrl":"https://mmg.whatsapp.net/file?auth=x","expiresAt":1}}','{"data":{"host":"mmg.whatsapp.net","uploadUrl":"https://mmg.whatsapp.net/file","expiresAt":1}}','{"data":{"host":"mmg.whatsapp.net","uploadUrl":"https://mmg.whatsapp.net/file?auth=x","expiresAt":null}}','{"bad"'] as $raw) {
    $ecConfigure(['method' => 'POST','path' => '/messaging/s/media/upload-grants','body' => $grantBody,'version' => '2026-10-14','response' => $raw]);
    ecRaises(fn () => $ecMessaging->whatsappMedia->createUploadGrant('s', 'image', str_repeat('h', 32)), Polymorfa\ServerException::class);
}
$ecConfigure(['method' => 'POST','path' => '/messaging/s/media/upload-grants','body' => $grantBody,'response' => '{"data":{"host":"mmg.whatsapp.net","uploadUrl":"https://mmg.whatsapp.net/file?auth=fixture","expiresAt":1792100000}}']);
$ecMessaging->whatsappMedia->createUploadGrant('s', 'image', str_repeat('h', 32), new Polymorfa\RequestOptions(apiVersion:'2026-09-22'));
++$ecCount;
$before = count($ecObserved());
ecRaises(fn () => $ecMessaging->whatsappMedia->createUploadGrant('s', 'image', str_repeat('h', 32), new Polymorfa\RequestOptions(cancellation:$token)), Polymorfa\CancelledException::class);
ecCheck(count($ecObserved()) === $before, 'Grant cancellation');
foreach (['logs','grant','relay'] as $route) {
    $invoke = match($route) {
        'logs' => fn () => $ecA->requestLogs->list([], new Polymorfa\RequestOptions(maxNetworkRetries:0)),'grant' => fn () => $ecMessaging->whatsappMedia->createUploadGrant('s', 'image', str_repeat('h', 32)),default => fn () => $ecBrowser->whatsappMedia->uploadBytes('s', hex2bin($v['plaintext']), new Polymorfa\UploadWhatsAppMediaOptions('image', mediaKey:hex2bin($v['mediaKey'])))
    };
    $fixture = match($route) {
        'logs' => ['method' => 'GET','path' => $ecLogPath], 'grant' => ['method' => 'POST','path' => '/messaging/s/media/upload-grants','body' => $grantBody,'version' => '2026-10-14'],default => ['method' => 'POST','path' => '/messaging/s/media/uploads?type=image&fileEncSha256='.rawurlencode($hashUrl),'authorization' => $ecPrincipals[2]->authorization(),'version' => '2026-10-14','bodySha256' => hash('sha256', $cipher),'maxBodyBytes' => strlen($cipher)]
    };
    $ecConfigure($fixture + ['status' => 403,'response' => '{"error":{"code":"future_nine_code","param":"scope"}}','headers' => ['X-Trace-Id' => 'trace','Idempotent-Replayed' => 'false','Set-Cookie' => 'private']]);
    $e = ecRaises($invoke, Polymorfa\AuthorizationException::class);
    ecCheck($e->errorCode === 'future_nine_code' && $e->param === 'scope' && $e->metadata->headers['x-trace-id'] === 'trace' && !isset($e->metadata->headers['set-cookie']), 'Nine route authority errors preserved');
}
// Explicit keyed relay retries replay the same Node-authored ciphertext; the default remains once.
$relayCase = ['method' => 'POST','path' => '/messaging/s/media/uploads?type=image&fileEncSha256='.rawurlencode($hashUrl),'authorization' => $ecPrincipals[2]->authorization(),'version' => '2026-10-14','bodySha256' => hash('sha256', $cipher),'maxBodyBytes' => strlen($cipher),'statuses' => [503,200],'response' => '{"data":{"directPath":"/relay","url":"https://mmg.whatsapp.net/relay"}}','headers' => ['Retry-After' => '0']];
foreach ([null,0,1] as $retries) {
    $ecConfigure($relayCase);
    $policy = new Polymorfa\UploadWhatsAppMediaOptions('image', mediaKey:hex2bin($v['mediaKey']), requestOptions:new Polymorfa\RequestOptions(maxNetworkRetries:$retries, idempotencyKey:'relay-key'));
    if ($retries !== 1) {
        ecRaises(fn () => $ecBrowser->whatsappMedia->uploadBytes('s', hex2bin($v['plaintext']), $policy), Polymorfa\ServerException::class);
        ecCheck(count($ecObserved()) === 1, 'Relay unsafe default once');
    } else {
        $r = $ecBrowser->whatsappMedia->uploadBytes('s', hex2bin($v['plaintext']), $policy);
        $seen = $ecObserved();
        ecCheck(count($seen) === 2 && $seen[0]['bodySha256'] === $seen[1]['bodySha256'] && $seen[0]['idempotencyKey'] === 'relay-key' && $seen[1]['idempotencyKey'] === 'relay-key', 'Caller-keyed relay stable ciphertext');
        ++$ecCount;
    }
}
// Descriptor sends capture referenced recipient and descriptor before retry callbacks.
$recipient = ['id' => 'chat'];
$selected = $ecStickerDescriptor;
$sendBody = ['conversation' => &$recipient,'content' => ['sticker' => ['descriptor' => &$selected]]];
$sendMutator = new class (static function () use (&$recipient, &$selected): void {
    $recipient['id'] = 'changed';
    $selected = null;
}) extends GuzzleHttp\Client {
    public function __construct(private Closure $mutate)
    {
        parent::__construct();
    }
    public function request(string $method, $uri = '', array $options = []): Psr\Http\Message\ResponseInterface
    {
        ($this->mutate)();
        return parent::request($method, $uri, $options);
    }
};
$sender = new Polymorfa\MessagingClient($ecCredential, baseUrl:$ecUrl, http:$sendMutator);
$ecConfigure(['method' => 'POST','path' => '/messaging/s/messages/send','body' => ['conversation' => ['id' => 'chat'],'content' => ['sticker' => ['descriptor' => $ecStickerWire]]],'version' => '2026-10-14','statuses' => [503,200],'response' => json_encode(['success' => true,'data' => $ecStickerSent]),'headers' => ['Retry-After' => '0']]);
$sender->messages->send('s', $sendBody, new Polymorfa\RequestOptions(maxNetworkRetries:1, idempotencyKey:'sticker-replay'));
$seen = $ecObserved();
ecCheck(count($seen) === 2 && $seen[0]['bodySha256'] === $seen[1]['bodySha256'] && $recipient['id'] === 'changed' && $selected === null, 'Sticker recipient/descriptor references captured before retry callback');
++$ecCount;
