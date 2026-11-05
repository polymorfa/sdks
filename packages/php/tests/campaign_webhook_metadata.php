<?php

declare(strict_types=1);

$campaignMetadata = json_decode(file_get_contents(dirname(__DIR__, 3).'/contracts/fixtures/campaign-webhook-metadata.json'), true, 512, JSON_THROW_ON_ERROR);
$campaignSigned = static function (array $value) use ($campaignMetadata): Polymorfa\WebhookEvent|Polymorfa\WebhookEventBatch {
    $raw = json_encode($value, JSON_THROW_ON_ERROR);
    return Polymorfa\Webhooks::constructDelivery($raw, hash_hmac('sha256', $raw, $campaignMetadata['secret']), $campaignMetadata['secret']);
};
foreach ($campaignMetadata['events'] as $expected) {
    $actual = $campaignSigned($expected);
    check($actual instanceof Polymorfa\WebhookEvent && $actual->id === $expected['id'] && $actual->payload === $expected['payload'], 'campaign single/raw payload');
    check($actual->knownEvent()['payload'] === $expected['payload'], 'campaign known typed union');
}
$campaignBatch = $campaignSigned(['object'=>'event_batch','version'=>1,'id'=>$campaignMetadata['batchId'],'events'=>$campaignMetadata['events']]);
check($campaignBatch instanceof Polymorfa\WebhookEventBatch && count($campaignBatch->events) === 5, 'campaign mixed batch');
foreach ($campaignBatch->events as $i => $event) {
    check($event->id === $campaignMetadata['events'][$i]['id'] && $event->payload === $campaignMetadata['events'][$i]['payload'], 'campaign member order/raw metadata');
}
check($campaignBatch->events[0]->payload['code'] === 'future_automatic_pause' && $campaignBatch->events[0]->payload['pausedAt'] === 1757161200, 'open pause code/seconds');
check(!array_key_exists('reason', $campaignBatch->events[1]->payload) && !array_key_exists('code', $campaignBatch->events[1]->payload), 'manual omission');
check($campaignBatch->events[2]->payload['messageIndex'] === 0 && $campaignBatch->events[2]->payload['skippedAt'] === 1757161200000, 'zero index/milliseconds');
check($campaignBatch->events[3]->payload['followUpId'] === '0198a2cb-0000-7000-8000-0000000000f1', 'follow-up UUID');
check(!array_key_exists('messageIndex', $campaignBatch->events[4]->payload) && !array_key_exists('followUpId', $campaignBatch->events[4]->payload), 'skip optional omission');
$malformed = $campaignMetadata['events'][0]; $malformed['payload']['code'] = [];
check($campaignSigned($malformed)->payload['code'] === [], 'existing payload tolerance');
raises(fn()=>Polymorfa\Webhooks::constructDelivery('not JSON','bad',$campaignMetadata['secret']), Polymorfa\WebhookSignatureException::class);
$raw = json_encode($campaignMetadata['events'][0], JSON_THROW_ON_ERROR);
raises(fn()=>Polymorfa\Webhooks::constructDelivery($raw.' ',hash_hmac('sha256',$raw,$campaignMetadata['secret']),$campaignMetadata['secret']), Polymorfa\WebhookSignatureException::class);
