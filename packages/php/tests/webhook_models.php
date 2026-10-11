<?php

declare(strict_types=1);
$identity = ['id' => '15555555555@s.whatsapp.net','phoneNumber' => '+15555555555'];
$messageIds = ['linked_devices' => 'linked'];
$linked = ['id' => 'message','whatsapp_ids' => $messageIds,'conversation' => $identity,'fromMe' => false,'timestamp' => 1,'pushName' => 'Contact','isGroup' => false,'type' => 'image','media' => 'opaque','extraProviderField' => ['preserved' => true]];
$cloud = ['id' => 'message','whatsapp_ids' => ['official_api' => 'wamid.fixture'],'conversation' => ['id' => 'business-user','bsuid' => 'business-user'],'timestamp' => '1','type' => 'interactive','nativeFlowResponse' => ['name' => 'flow','paramsJson' => '{"answer":false}'],'replyChoice' => ['kind' => 'button','id' => 'choice'],'referral' => ['ctwa_clid' => 'click','source_id' => 'ad']];
$customer = ['eventId' => 'event','occurredAt' => 'now','organizationId' => 'org','projectId' => 'project','customerId' => 'customer','actorKind' => 'org_key'];
$payment = ['reportedBy' => 'whatsapp','providerEventId' => 'provider','referenceId' => 'order','conversation' => ['phoneNumber' => '+15555555555']];
$cases = [
 ['message.received',$linked],['message.received',$cloud],['message.reaction',$linked],
 ['message.ack',['messages' => [['id' => 'message','whatsapp_ids' => ['official_api' => 'wamid.fixture']]],'conversation' => $identity,'type' => 'delivered','timestamp' => 1,'pricing' => ['category' => 'utility','type' => 'free_customer_service']]],
 ['message.vote',['conversation' => $identity,'pollMessageId' => 'message','voter' => $identity,'selectedHashes' => ['hash'],'timestamp' => 1]],
 ['message.failed',['to' => $identity,'type' => 'text','error' => 'blocked_by_safety','retryAfter' => 1.25,'timestamp' => 1]],
 ['session.status',['source' => 'meta','kind' => 'account_update','wabaId' => 'waba','value' => ['providerField' => 'unknown']]],
 ['session.status',['status' => 'connected','statusReason' => 'Fixture']],
 ['session.connected',['phoneNumber' => '+15555555555','pushName' => 'Contact','phonePlatform' => 'meta_cloud','accountType' => 'meta_coexistence']],
 ['session.restriction_updated',['type' => 'reachout_timelock','active' => true,'enforcementType' => null,'expiresAt' => null,'observedAt' => 'now']],
 ['group.participant',['id' => 'group','failedParticipants' => [['participant' => $identity,'errors' => [['code' => 123,'title' => 'Unavailable']]]],'joinRequest' => ['joinRequestId' => 'request','user' => $identity,'state' => 'created']]],
 ['call.received',['from' => $identity,'callId' => 'call','hasVideo' => false,'sessionConnection' => 'cloud_api','capabilities' => ['video' => false,'invite' => false]]],
 ['call.ended',['from' => null,'callId' => 'call','durationSeconds' => 1.125,'reason' => 'pod_lost','direction' => 'outbound','hadVideo' => false]],
 ['call.participant_state',['callId' => 'call','participant' => ['id' => 'participant','audioMuted' => false,'video' => false,'state' => 'connected','handRaised' => true]]],
 ['call.connection_left',['callId' => 'call','connectionId' => 'connection','participant' => 'server:participant','reason' => 'sip_auth_failed']],
 ['call.permission_changed',['conversation' => $identity,'status' => 'temporary','previousStatus' => 'none','expiresAt' => 'later','source' => 'sync','changedAt' => 'now']],
 ['contact.opted_out',['phone' => '+15555555555','source' => 'stop-keyword','keyword' => 'STOP','session' => 'session','projectId' => 'project']],
 ['history.sync',['kind' => 'history','value' => ['providerRecords' => []]]],
 ['history.sync',['whatsapp_ids' => $messageIds,'messages' => [['id' => 'message','whatsapp_ids' => $messageIds,'conversation' => $identity]],'mode' => 'deliver','syncType' => 'RECENT','fileLength' => 10,'conversationCount' => 1,'messageCount' => 1,'pushNameCount' => 0,'statusMessageCount' => 0,'whatsapp' => ['encoding' => 'gzip-base64-protobuf','data' => 'opaque']]],
 ['customer.updated',$customer + ['fields' => ['externalCustomerId']]],
 ['customer.pairing_link.connected',$customer + ['pairingLinkId' => 'pairing','sessionId' => 'sid']],
 ['customer.number.transferred',$customer + ['sessionId' => 'sid','sourceCustomerId' => 'prior']],
 ['order.payment_updated',$payment + ['kind' => 'payment_status','status' => 'captured','amount' => ['value' => 1234,'offset' => 100],'currency' => 'BRL','transaction' => ['providerTransactionId' => 'transaction','method' => 'pix']]],
 ['order.payment_updated',$payment + ['kind' => 'payment_method_selected','messageId' => 'message','paymentMethod' => 'card','lastFourDigits' => '1234','credentialId' => 'credential','paymentTimestamp' => 1]],
 ['bansafe.claim',['id' => 'claim','incidentId' => 'incident','phoneNumber' => '+15555555555','status' => 'paid','verdict' => 'ours','windowStart' => 'start','windowEnd' => 'end','measuredCents' => 0.000001,'capCents' => 1.125,'amountCents' => 0.125,'summary' => 'Fixture','reason' => 'Review','decidedAt' => 'now','paidAt' => 'now']],
 ['template.status',['kind' => 'message_template_quality_update','templateId' => 'template','previousQualityScore' => 'GREEN','newQualityScore' => 'YELLOW']],
 ['campaign.rescheduled',['campaignId' => 'campaign','previousScheduledAt' => null,'scheduledAt' => 1000,'rescheduledAt' => 1000]],
 ['voice.asset_failed',['eventId' => 'event','occurredAt' => 'now','organizationId' => 'org','projectId' => 'project','assetId' => 'asset','name' => 'Fixture','source' => 'future_source','failureReason' => 'future_reason']],
 ['usage.recorded',['id' => 'usage','meter' => 'call.duration','quantity' => 1.125,'unit' => 'second','dimensions' => ['video' => false],'keySource' => 'none','sourceKind' => 'call','sourceId' => 'call','projectId' => null,'session' => null,'occurredAt' => 'now','recordedAt' => 'now','revision' => 2,'pricingState' => 'unpriced','rateCard' => null,'pricedCredits' => null]],
];
foreach ($cases as [$name,$payload]) {
    $body = ['id' => 'event','session' => 'session','externalId' => 'app-owned','timestamp' => '2026-10-11T00:00:00Z','event' => $name,'payload' => $payload];
    $raw = json_encode($body, JSON_THROW_ON_ERROR | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_UNICODE);
    $event = Polymorfa\Webhooks::constructEvent($raw, hash_hmac('sha256', $raw, 'synthetic'), 'synthetic');
    check($event->knownEvent() === $body && $event->externalId === 'app-owned', 'Typed signed webhook '.$name);
    $fixture = Polymorfa\Webhooks::createFixture($event, 'synthetic');
    check($fixture['body'] === $raw && Polymorfa\Webhooks::verifySignature($fixture['body'], $fixture['signature'], 'synthetic'), 'Fixture round trip');
}
$unknown = Polymorfa\Webhooks::parseVerifiedEvent('{"id":"event","session":"","timestamp":"now","event":"future.event","payload":[false,null,{"opaque":3}]}');
check($unknown->knownEvent() === null && $unknown->payload === [false,null,['opaque' => 3]], 'Unknown structured payload remains exact');
$source = file_get_contents(__DIR__.'/../src/WebhookModels.php');
foreach (Polymorfa\Webhooks::KNOWN_TYPES as $name) {
    check(str_contains($source, "'".$name."'"), 'Every known name has a typed union variant: '.$name);
}
check(count(Polymorfa\Webhooks::KNOWN_TYPES) === 84, 'Pinned known event catalog');
$raw = '{"id":"event","session":"","timestamp":"now","event":"future.event","payload":null}';
$flow = 't=1000,v1='.strtoupper(hash_hmac('sha256', '1000.'.$raw, 'secret'));
check(Polymorfa\Webhooks::verifyFlowForwardSignature($raw, $flow, 'secret', nowUnixSeconds:1000.5), 'Flow raw HMAC and uppercase signature');
check(!Polymorfa\Webhooks::verifyFlowForwardSignature($raw, $flow, 'secret', nowUnixSeconds:1301), 'Flow expiry');
check(!Polymorfa\Webhooks::verifySignature($raw, $flow, 'secret'), 'Native signature grammar excludes timestamp framing');
$key = str_repeat("\x01", 32);
$local = rtrim(strtr(base64_encode($key), '+/', '-_'), '=');
$signature = 't=0001000,v1='.hash_hmac('sha256', '1000.'.$raw, $key);
check(Polymorfa\Webhooks::verifyLocal($raw, $signature, $local, nowUnixSeconds:1000)->event === 'future.event', 'Local signature normalizes numeric timestamp and decodes byte key');
raises(fn () => Polymorfa\Webhooks::verifyLocal($raw, $signature, $local, nowUnixSeconds:1301), Polymorfa\WebhookSignatureException::class);
raises(fn () => Polymorfa\Webhooks::verifyLocal($raw, strtoupper($signature), $local, nowUnixSeconds:1000), Polymorfa\WebhookSignatureException::class);
check(count(Polymorfa\ErrorCodes::KNOWN) === 89 && Polymorfa\ErrorCodes::isKnown('voice_unavailable') && !Polymorfa\ErrorCodes::isKnown('future_api_code'), 'Known API code catalog');
check((new Polymorfa\PolymorfaException('Fixture','future_api_code'))->errorCode === 'future_api_code','Unknown API codes preserved');
echo count($cases)." signed typed webhook fixtures, 84 union variants and signature utility checks passed.\n";
