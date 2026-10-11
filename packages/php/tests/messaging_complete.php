<?php

declare(strict_types=1);
$receipt = ['success' => true,'data' => ['id' => 'message','whatsapp_ids' => ['linked_devices' => 'linked','official_api' => 'cloud'],'conversation' => ['id' => 'user','bsuid' => 'opaque'],'timestamp' => '2026-10-11T00:00:00Z','status' => 'sent','type' => 'text','transport' => 'linked_devices','routingReason' => 'session_rule','operationId' => 'operation']];
$contents = [
 ['text' => 'Hi'],['image' => ['url' => 'https://fixture.invalid/image','caption' => 'Caption']],['video' => ['base64' => 'AA==']],['file' => ['url' => 'https://fixture.invalid/file','filename' => 'file.pdf']],['voice' => ['base64' => 'AA==','ptt' => false]],
 ['poll' => ['title' => 'Pick','options' => ['A','B'],'multiSelect' => false]],['location' => ['lat' => 1.25,'long' => 2.5,'address' => 'Place']],['contact' => ['vcard' => 'BEGIN:VCARD']],['requestPhoneNumber' => []],
 ['product' => ['businessOwnerId' => 'business','id' => 'product','title' => 'Product','currencyCode' => 'USD','priceAmount1000' => 1000]],
 ['productList' => ['businessOwnerId' => 'business','title' => 'Products','buttonText' => 'Open','sections' => [['productIds' => ['product']]]]],
 ['order' => ['id' => 'order','itemCount' => 1,'status' => 'inquiry','sellerId' => 'business','totalAmount1000' => 1000,'totalCurrencyCode' => 'USD']],
 ['list' => ['title' => 'Options','buttonText' => 'Open','sections' => [['rows' => [['id' => 'row','title' => 'Choice']]]]]],
 ['buttons' => ['body' => 'Choose','buttons' => [['type' => 'url','text' => 'Open','url' => 'https://fixture.invalid']]]],
 ['addressMessage' => ['body' => 'Address','country' => 'BR']],['flow' => ['body' => 'Start','buttonText' => 'Open','id' => 'flow','token' => 'fixture','action' => 'navigate','screen' => 'FIRST','dataJson' => '{}']],
 ['flow' => ['body' => 'Start','buttonText' => 'Open','id' => 'flow','token' => 'fixture','action' => 'data_exchange']],['callPermissionRequest' => ['body' => 'May we call?']],
 ['orderDetails' => ['referenceId' => 'order','type' => 'digital-goods','body' => 'Pay','currency' => 'BRL','totalAmount' => ['value' => 100,'offset' => 100],'paymentSettings' => ['paymentLink' => ['uri' => 'https://fixture.invalid/pay']]]],
 ['orderStatus' => ['referenceId' => 'order','body' => 'Paid','payment' => ['status' => 'captured','timestamp' => 1]]],['template' => ['name' => 'welcome','language' => 'en_US','components' => []]],
];
$cases = [];
foreach ($contents as $content) {
    $body = ['conversation' => ['phoneNumber' => '+15555555555'],'content' => $content,'transport' => 'auto','isForwarded' => false,'mentions' => [],'quotedMessage' => ['id' => 'previous','text' => 'Quote']];
    $cases[] = ['POST','/messaging/session/messages/send',$body,$receipt,fn ($c) => $c->messages->send('session', $body)];
}
$operation = ['success' => true,'data' => ['operationId' => 'operation','status' => 'completed','transport' => 'official_api','receipt' => ['whatsapp_ids' => ['official_api' => 'cloud'],'timestamp' => '2026-10-11T00:00:00Z']]];
$cases[] = ['GET','/messaging/session/operations/operation',null,$operation,fn ($c) => $c->messages->operationStatus('session', 'operation')];
$cases[] = ['POST','/messaging/session/calls/call/reject',['from' => 'caller'],['success' => true,'data' => ['requestId' => 'request']],fn ($c) => $c->calls->reject('session', 'call', ['from' => 'caller'])];
$link = ['success' => true,'data' => ['purpose' => 'add_connection','connectionGoal' => 'hybrid','addConnection' => 'official_api','id' => 'link','url' => 'https://fixture.invalid/link','session' => 'session','expiresAt' => null]];
$cases[] = ['POST','/messaging/quicklinks',['purpose' => 'add_connection','session' => 'session','connectionGoal' => 'hybrid','configuration' => ['methods' => ['qr','pairing'],'defaultMethod' => null,'allowPhoneChange' => false,'historySync' => ['consent' => 'force_off','mode' => 'metadata_only','requestFull' => false]]],$link,fn ($c) => $c->quickLinks->create(['purpose' => 'add_connection','session' => 'session','connectionGoal' => 'hybrid','configuration' => ['methods' => ['qr','pairing'],'defaultMethod' => null,'allowPhoneChange' => false,'historySync' => ['consent' => 'force_off','mode' => 'metadata_only','requestFull' => false]]])];
$available = ['success' => true,'data' => ['allowed' => false,'addConnection' => null,'connections' => [['kind' => 'linked_devices','status' => 'connected','enabled' => true]],'resumeQuickLinkId' => null]];
$cases[] = ['GET','/messaging/quicklinks/availability?projectId=project&session=session',null,$available,fn ($c) => $c->quickLinks->availability('project', 'session')];
$hook = ['success' => true,'data' => ['id' => 'webhook','tenantId' => 'org','session' => 'session','url' => 'https://fixture.invalid/events','events' => [],'retries' => ['attempts' => 5,'delaySeconds' => 1.25,'policy' => 'exponential'],'headers' => [],'enabled' => false,'format' => 'native','createdAt' => '2026-10-11T00:00:00Z']];
$cases[] = ['GET','/messaging/webhooks',null,['success' => true,'data' => [$hook['data']]],fn ($c) => $c->webhooks->list()];
$cases[] = ['POST','/messaging/webhooks',['url' => 'https://fixture.invalid/events','events' => [],'headers' => [],'retries' => ['attempts' => 5,'delaySeconds' => 1.25,'policy' => 'exponential']],$hook,fn ($c) => $c->webhooks->create(['url' => 'https://fixture.invalid/events','events' => [],'headers' => [],'retries' => ['attempts' => 5,'delaySeconds' => 1.25,'policy' => 'exponential']])];
$cases[] = ['PUT','/messaging/webhooks/webhook',['enabled' => false,'format' => 'native'],$hook,fn ($c) => $c->webhooks->update('webhook', ['enabled' => false,'format' => 'native'])];
$cases[] = ['GET','/messaging/media/media/info',null,['success' => true,'data' => ['id' => 'media','session' => 'session','messageId' => 'message','mimeType' => 'image/png','fileLength' => 3,'persisted' => false,'s3Url' => null]],fn ($c) => $c->media->retrieve('media')];
$cases[] = ['POST','/messaging/media/media/download-and-save',null,['success' => true,'message' => 'Saved'],fn ($c) => $c->media->persist('media')];
nativeCases($cases, fn ($credential, $url) => new Polymorfa\MessagingClient($credential, baseUrl:$url));
