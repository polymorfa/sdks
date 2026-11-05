<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{Client, MessagingClient, ProjectClient};

function invalidCampaignConsumers(Client $org, MessagingClient $messaging, ProjectClient $bound, string $id): void
{
    $bound->campaigns->getSettings();
    $bound->signalCustody->updateCustomer($id, null);
    $org->projects->updateSignalCustody($id, ['expectedRevision' => 0, 'signalModeDefault' => null]);
    // PHPStan accepts this boolean-union edge; runtime guards reject it before HTTP.
    $org->optOuts->updateConfirmationSettings(['teamId' => $id, 'enabled' => true, 'locale' => null, 'revision' => 0]);
    $org->optOuts->updateConfirmationSettings(['teamId' => $id, 'enabled' => true, 'locale' => false, 'revision' => 0]);
    $messaging->campaigns->testSend('slug', $id, ['sessionId' => $id, 'to' => '+15555555555', 'variables' => ['a' => null]]);
    $messaging->campaigns->createReplyFlow('slug', ['name' => 'Flow', 'definition' => ['entryNodeId' => 'a', 'nodes' => [['id' => 'a', 'edges' => [], 'send' => ['kind' => 'native_flow', 'flowId' => $id]]]]]);
    $org->audienceProfiles->put('+15555555555', ['tags' => [], 'attributes' => [], 'provenance' => null]);
    $messaging->campaigns->setReplyFlow('slug', $id, []);
}
