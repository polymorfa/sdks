<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{Client, MessagingClient, ProjectClient};

// Each line in this function must fail PHPStan; tests run the analysis in JSON mode.
function invalidSegmentDripConsumers(Client $org, MessagingClient $messaging, ProjectClient $bound, string $p): void
{
    $bound->audienceSegments->list();
    $org->campaigns->enroll('c', ['phone' => '+1']);
    $org->campaigns->updateFrequencyCap(['maxPer24Hours' => 1,'revision' => 0]);
    $org->audienceSegments->update('s', ['name' => 'x']);
    $org->audienceSegments->previewRules(['match' => 'all','groups' => [['match' => 'all','conditions' => [['field' => 'consent','operator' => 'equals','value' => 1]]]]]);
    $org->campaigns->create(['projectId' => $p,'name' => 'x','segmentId' => null]);
    $org->campaigns->create(['projectId' => $p,'name' => 'x','drip' => ['enrollment' => 'weekly']]);
    $org->campaigns->create(['projectId' => $p,'name' => 'x','messagesArray' => [['delayUnit' => 'weeks']]]);
    $messaging->campaigns->enroll('slug', 'c', ['phone' => '+1','variables' => ['a' => null]]);
    $org->audienceSegments->delete('s', '2');
}
