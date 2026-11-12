<?php

declare(strict_types=1);

$newsletterDir = dirname(__DIR__, 3).'/contracts/fixtures/newsletter-observations/';
$newsletterFixture = json_decode(file_get_contents($newsletterDir.'delivery.json'), false, 512, JSON_THROW_ON_ERROR);
$newsletterSigned = static function (mixed $value) use ($newsletterFixture): Polymorfa\WebhookEvent|Polymorfa\WebhookEventBatch {
    $raw = json_encode($value, JSON_THROW_ON_ERROR);
    return Polymorfa\Webhooks::constructDelivery($raw, hash_hmac('sha256', $raw, $newsletterFixture->secret), $newsletterFixture->secret);
};
$newsletterBatch = $newsletterSigned((object) ['object'=>'event_batch','version'=>1,'id'=>$newsletterFixture->batchId,'events'=>$newsletterFixture->events]);
check($newsletterBatch instanceof Polymorfa\WebhookEventBatch && count($newsletterBatch->events) === 3, 'newsletter batch');
foreach ($newsletterFixture->events as $i => $expected) {
    $event = $newsletterSigned($expected);
    check($event instanceof Polymorfa\WebhookEvent && $event->knownEvent() !== null, 'newsletter typed event');
    check($event->payload === $newsletterBatch->events[$i]->payload, 'newsletter batch metadata');
    foreach ([$event, $newsletterBatch->events[$i]] as $member) {
        $roundtrip = Polymorfa\Webhooks::createFixture($member, $newsletterFixture->secret);
        $tree = json_decode($roundtrip['body'], false, 512, JSON_THROW_ON_ERROR);
        check(json_encode($tree->payload) === json_encode($expected->payload), 'newsletter wire zero/object/omission roundtrip');
    }
}
$newsletterLive = $newsletterBatch->events[0]->knownEvent()['payload'];
check($newsletterLive['messages'][0]['forwards'] === 0 && $newsletterLive['messages'][0]['reactionCounts'] === [], 'newsletter explicit zero/empty map');
check($newsletterLive['messages'][1] === ['position'=>124], 'newsletter missing reference');
$newsletterMilestone = $newsletterBatch->events[1]->knownEvent()['payload'];
check($newsletterMilestone['milestone']['type'] === 'FUTURE_MILESTONE' && $newsletterMilestone['milestone']['value'] === 0, 'newsletter unknown milestone');
$newsletterChannel = json_decode(file_get_contents($newsletterDir.'channel-message.json'), true, 512, JSON_THROW_ON_ERROR);
check($newsletterChannel['forwards'] === 0, 'channel reported forward zero');
