<?php

declare(strict_types=1);

// Positive PHPStan consumer controls for frequency caps, segments and drips.
use Polymorfa\{Client,MessagingClient};

function segmentDripConsumers(Client $team, MessagingClient $messaging, string $project): void
{
    $cap = $team->campaigns->getFrequencyCap()->data['data'];
    $saved = $team->campaigns->updateFrequencyCap(['maxPer24Hours' => null,'maxPer7Days' => 5,'revision' => $cap['revision']])->data['data'];
    $updatedAt = $saved['updatedAt'];
    $rules = ['match' => 'all','groups' => [['match' => 'any','negate' => true,'conditions' => [
        ['field' => 'tag','operator' => 'in','values' => ['vip']],
        ['field' => 'attribute','name' => 'spend','operator' => 'greater_than','value' => 1.5],
        ['field' => 'attribute','name' => 'tier','operator' => 'in','values' => ['gold',2]],
        ['field' => 'campaign','campaignId' => $project,'outcome' => 'not_replied'],
    ]]]];
    $segment = $team->audienceSegments->create(['name' => 'VIP','rules' => $rules])->data['data'];
    $team->audienceSegments->update($segment['id'], ['expectedRevision' => $segment['revision'],'name' => 'VIP 2']);
    $preview = $team->audienceSegments->preview($segment['id'])->data['data'];
    $eligible = $preview['eligibleCount'] + $preview['revision'];
    $team->audienceSegments->delete($segment['id'], $segment['revision']);
    $page = $team->audienceSegments->list(['limit' => 10])->data['page'];
    $next = $page['nextCursor'];
    $team->campaigns->create(['projectId' => $project,'name' => 'drip','segmentId' => $segment['id'],'drip' => ['enrollment' => 'continuous'],'frequencyCap' => null,'messagesArray' => [['source' => 'later','delayAfterSec' => 86400,'delayUnit' => 'days','sendWindow' => ['days' => ['monday'],'hours' => [['start' => '09:00','end' => '17:00']]]]]]);
    $campaign = $team->campaigns->update('c', ['drip' => ['exitOnReply' => false],'segmentId' => null], ['projectId' => $project])->data['data'];
    $snapshot = $campaign['segmentSnapshot'] ?? null;
    $enrolled = $team->campaigns->enroll('c', ['projectId' => $project,'phone' => '+15555555555'])->data['data']['created'];
    $messaging->campaigns->update('slug', 'c', ['drip' => null,'frequencyCap' => ['maxPer24Hours' => 1,'maxPer7Days' => null]]);
    $stats = $messaging->campaigns->analytics('slug', 'c')->data['data']['drip'] ?? null;
    $step = $stats === null ? null : $stats['steps'][0]['exited'];
    $enrollment = $messaging->campaigns->enroll('slug', 'c', ['phone' => '+15555555555','variables' => ['vip' => true]])->data['data']['enrolledAt'];
    unset($updatedAt, $eligible, $next, $snapshot, $enrolled, $step, $enrollment);
}
