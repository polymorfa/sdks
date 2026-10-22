<?php

declare(strict_types=1);

use Polymorfa\{MessagingClient,Credential,RequestOptions,Webhooks,WebhookEventBatch,ValidationException,WebhookSignatureException};

$jpeg = file_get_contents(__DIR__.'/../../../contracts/fixtures/official-group-picture.jpg');
check(is_string($jpeg), 'JPEG fixture loaded');
$state = ['catalogId'=>'123','syncedAt'=>null,'stale'=>true,'productCount'=>1,'lastAttempt'=>['startedAt'=>'now','finishedAt'=>null,'outcome'=>'future']];
$history = [];
$responseData = ['success'=>true,'data'=>$state + ['catalogs'=>[$state],'catalog'=>$state,'products'=>[['id'=>'p','price'=>'0.10']],'nextCursor'=>'next_-','accepted'=>true,'wabaId'=>'w','onboarding'=>['status'=>'unknown','metaStatus'=>null],'terms'=>['status'=>'unknown','metaStatus'=>null,'date'=>null],'cloudApiMarketingDisabled'=>false,'nextAction'=>'none','guideUrl'=>'https://example.test','observedAt'=>'now']];
$responses = [];
for ($responseIndex = 0; $responseIndex < 6; ++$responseIndex) {
    $responses[] = jsonResponse($responseData);
}
check(count(array_unique(array_map(static fn(\Psr\Http\Message\ResponseInterface $response): int => spl_object_id($response), $responses))) === 6, 'independent Official response objects');
check(count(array_unique(array_map(static fn(\Psr\Http\Message\ResponseInterface $response): int => spl_object_id($response->getBody()), $responses))) === 6, 'independent Official response bodies');
$officialPictureBody = '';
$officialPictureResponse = $responses[5];
$responses[5] = static function (\Psr\Http\Message\RequestInterface $request) use (&$officialPictureBody, $officialPictureResponse): \Psr\Http\Message\ResponseInterface {
    $body = $request->getBody();
    $position = $body->tell();
    try {
        $officialPictureBody = (string) $body;
    } finally {
        $body->seek($position);
    }
    return $officialPictureResponse;
};
$http = mocked($responses, $history);
$c = new MessagingClient(Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'), http:$http);
$c->catalogs->list('n /x');
check($c->catalogs->retrieve('n /x','123')->data['data']['syncedAt'] === null, 'nullable sync');
$c->catalogs->sync('n /x','123');
check($c->catalogs->listProducts('n /x','123',['limit'=>100,'cursor'=>'next_-'])->data['data']['products'][0]['price'] === '0.10', 'exact price');
$c->cloudMarketing->getStatus('n /x');
$c->officialGroups->setPicture('n /x','g/x',$jpeg);
check(count($history) === 6, 'six operations');
check($history[0]['request']->getUri()->getPath() === '/messaging/n%20%2Fx/catalogs', 'native path');
$request = $history[5]['request'];
check($request->getMethod() === 'PUT' && $request->getUri()->getPath() === '/messaging/n%20%2Fx/official-groups/g%2Fx/picture', 'picture route');
check(str_starts_with($request->getHeaderLine('Content-Type'), 'multipart/form-data; boundary='), 'multipart boundary');
check(str_contains($officialPictureBody, $jpeg) && str_contains($officialPictureBody, 'Content-Type: image/jpeg'), 'actual jpeg');
raises(fn()=> $c->catalogs->retrieve('n','../'), ValidationException::class);
raises(fn()=> $c->catalogs->listProducts('n','123',['limit'=>0]), ValidationException::class);
$event = ['id'=>'e','session'=>'','timestamp'=>'now','event'=>'contact.update','payload'=>['id'=>'new','parentBsuid'=>'new-p','identityChange'=>['reason'=>'user_id_changed','messageId'=>'m','previous'=>['id'=>'old','parentBsuid'=>'old-p']]]];
$batch = ['object'=>'event_batch','version'=>1,'id'=>'00000000-0000-4000-8000-000000000001','events'=>[$event,$event]];
$signed = static function (array $value) { $raw=json_encode($value,JSON_THROW_ON_ERROR); return Webhooks::constructDelivery($raw,hash_hmac('sha256',$raw,'s'),'s'); };
$value=$signed($batch);check($value instanceof WebhookEventBatch && count($value->events) === 2 && $value->events[0]->id === 'e', 'batch ordering');
check($value->events[0]->payload['identityChange']['previous']['id'] === 'old' && $value->events[0]->payload['parentBsuid'] === 'new-p', 'previous identity');
$one=$batch;$one['events']=[$event];check(count($signed($one)->events)===1,'one-member batch');
check($signed($event)->id === 'e', 'single event');
$raw=json_encode($batch,JSON_THROW_ON_ERROR);raises(fn()=>Webhooks::constructDelivery($raw.' ',hash_hmac('sha256',$raw,'s'),'s'),WebhookSignatureException::class);
foreach ([[],[$batch],[['id'=>'e']],array_fill(0,101,$event)] as $members) { $bad=$batch;$bad['events']=$members;raises(fn()=>$signed($bad),ValidationException::class); }
$bad=$batch;$bad['version']=2;raises(fn()=>$signed($bad),ValidationException::class);
foreach ([['batching'=>['enabled'=>true,'maxEvents'=>1]],['format'=>'meta','batching'=>['enabled'=>true]]] as $body) { raises(fn()=>\Polymorfa\WebhookBatching::validate($body), ValidationException::class); }
foreach ([false,true] as $project) {
    $history=[];$hook=['id'=>'w','batching'=>['enabled'=>false,'maxEvents'=>100,'windowMs'=>1000]];
    $owner=new \Polymorfa\Client(Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'),http:mocked([jsonResponse(['data'=>['webhook'=>$hook]]),jsonResponse(['data'=>['webhook'=>$hook]]),jsonResponse(['data'=>$hook])],$history));
    $resource=($project ? $owner->project('p/x') : $owner)->webhooks;
    $resource->create(['url'=>'https://example.test','eventTypes'=>[],'batching'=>['enabled'=>false]]);
    $resource->update('w',['batching'=>['enabled'=>false]]);
    check($resource->retrieve('w')->data['batching']['maxEvents']===100,'batching read');
    check(json_decode((string)$history[1]['request']->getBody(),true,512,JSON_THROW_ON_ERROR)===['batching'=>['enabled'=>false]],'PATCH omission and false');
}
$history=[];$c=new MessagingClient(Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'),http:mocked([jsonResponse(['error'=>['code'=>'catalog_sync_cooldown','message'=>'Wait']],429,['Retry-After'=>'120'])],$history));
$error=raises(fn()=>$c->catalogs->sync('n','123',new RequestOptions(maxNetworkRetries:3,idempotencyKey:'key')),\Polymorfa\RateLimitException::class);
check(count($history)===1,'one sync submission');
foreach ([...\Polymorfa\OfficialRound2Models::READINESS_CODES,'future_readiness',null] as $code) {
    $history=[];$c=new MessagingClient(Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'),http:mocked([jsonResponse(['success'=>true,'data'=>['errorCode'=>$code,'onboarding'=>['errorCode'=>$code]]])],$history));
    $status=$c->quickLinks->retrieve('q')->data['data'];check($status['errorCode']===$code && $status['onboarding']['errorCode']===$code,'open nullable readiness');
}
$history=[];$graph=['id'=>'w','marketing_messages_onboarding_status'=>'future','owner_business_info'=>['marketing_messages_onboarding_status'=>['status'=>'future_terms','time'=>'now']],'disable_marketing_messages_on_cloud_api'=>false];
$c=new MessagingClient(Credential::organizationApiKey('pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k'),http:mocked([jsonResponse($graph)],$history));
check($c->cloudMarketing->status('w',['version'=>'v26.0'])->data===$graph,'raw graph terms and disabled');

$cancel=new \Polymorfa\CancellationToken();$cancel->cancel();
raises(fn()=>$c->officialGroups->setPicture('n','g',$jpeg,new RequestOptions(cancellation:$cancel)),\Polymorfa\CancelledException::class);
