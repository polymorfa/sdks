<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{Client, MessagingClient, ProjectClient};

// Each line in this function must fail PHPStan; tests run the analysis in JSON mode.
function invalidSegmentDripConsumers(Client $team, MessagingClient $messaging, ProjectClient $bound, string $p): void
{
    $bound->audienceSegments->list();
    $team->campaigns->enroll('c', ['phone' => '+1']);
    $team->campaigns->updateFrequencyCap(['maxPer24Hours' => 1,'revision' => 0]);
    $team->audienceSegments->update('s', ['name' => 'x']);
    $team->audienceSegments->previewRules(['match' => 'all','groups' => [['match' => 'all','conditions' => [['field' => 'consent','operator' => 'equals','value' => 1]]]]]);
    $team->campaigns->create(['projectId' => $p,'name' => 'x','segmentId' => null]);
    $team->campaigns->create(['projectId' => $p,'name' => 'x','drip' => ['enrollment' => 'weekly']]);
    $team->campaigns->create(['projectId' => $p,'name' => 'x','messagesArray' => [['delayUnit' => 'weeks']]]);
    $messaging->campaigns->enroll('slug', 'c', ['phone' => '+1','variables' => ['a' => null]]);
    $team->audienceSegments->delete('s', '2');
}
