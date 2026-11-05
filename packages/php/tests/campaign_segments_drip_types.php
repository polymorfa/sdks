<?php

declare(strict_types=1);

// Positive PHPStan consumer controls for frequency caps, segments and drips.
use Polymorfa\{Client,MessagingClient};

function segmentDripConsumers(Client $org, MessagingClient $messaging, string $project): void
{
    $cap = $org->campaigns->getFrequencyCap()->data['data'];
    $saved = $org->campaigns->updateFrequencyCap(['maxPer24Hours' => null,'maxPer7Days' => 5,'revision' => $cap['revision']])->data['data'];
    $updatedAt = $saved['updatedAt'];
    $rules = ['match' => 'all','groups' => [['match' => 'any','negate' => true,'conditions' => [
        ['field' => 'tag','operator' => 'in','values' => ['vip']],
        ['field' => 'attribute','name' => 'spend','operator' => 'greater_than','value' => 1.5],
        ['field' => 'attribute','name' => 'tier','operator' => 'in','values' => ['gold',2]],
        ['field' => 'campaign','campaignId' => $project,'outcome' => 'not_replied'],
    ]]]];
    $segment = $org->audienceSegments->create(['name' => 'VIP','rules' => $rules])->data['data'];
    $org->audienceSegments->update($segment['id'], ['expectedRevision' => $segment['revision'],'name' => 'VIP 2']);
    $preview = $org->audienceSegments->preview($segment['id'])->data['data'];
    $eligible = $preview['eligibleCount'] + $preview['revision'];
    $org->audienceSegments->delete($segment['id'], $segment['revision']);
    $page = $org->audienceSegments->list(['limit' => 10])->data['page'];
    $next = $page['nextCursor'];
    $org->campaigns->create(['projectId' => $project,'name' => 'drip','segmentId' => $segment['id'],'drip' => ['enrollment' => 'continuous'],'frequencyCap' => null,'messagesArray' => [['source' => 'later','delayAfterSec' => 86400,'delayUnit' => 'days','sendWindow' => ['days' => ['monday'],'hours' => [['start' => '09:00','end' => '17:00']]]]]]);
    $campaign = $org->campaigns->update('c', ['drip' => ['exitOnReply' => false],'segmentId' => null], ['projectId' => $project])->data['data'];
    $snapshot = $campaign['segmentSnapshot'] ?? null;
    $enrolled = $org->campaigns->enroll('c', ['projectId' => $project,'phone' => '+15555555555'])->data['data']['created'];
    $messaging->campaigns->update('slug', 'c', ['drip' => null,'frequencyCap' => ['maxPer24Hours' => 1,'maxPer7Days' => null]]);
    $stats = $messaging->campaigns->analytics('slug', 'c')->data['data']['drip'] ?? null;
    $step = $stats === null ? null : $stats['steps'][0]['exited'];
    $enrollment = $messaging->campaigns->enroll('slug', 'c', ['phone' => '+15555555555','variables' => ['vip' => true]])->data['data']['enrolledAt'];
    unset($updatedAt, $eligible, $next, $snapshot, $enrolled, $step, $enrollment);
}
