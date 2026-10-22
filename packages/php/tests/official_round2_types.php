<?php

declare(strict_types=1);

function officialRound2Consumer(\Polymorfa\MessagingClient $client, \Polymorfa\Client $owner, string $jpeg): void
{
    $catalog = $client->catalogs->retrieve('number-id', '123')->data['data'];
    officialRound2Text($catalog['catalogId']);
    if ($catalog['syncedAt'] !== null) { officialRound2Text($catalog['syncedAt']); }
    $page = $client->catalogs->listProducts('number-id', '123', ['limit' => 100])->data['data'];
    foreach ($page['products'] as $product) { officialRound2Text($product['id']); if (isset($product['price'])) { officialRound2Text($product['price']); } }
    $status = $client->cloudMarketing->getStatus('number-id')->data['data'];
    officialRound2Text($status['terms']['status']);
    $client->officialGroups->setPicture('number-id', 'group-id', $jpeg);
    $owner->webhooks->update('w', ['batching' => ['enabled' => false]]);
    $owner->project('project-id')->webhooks->create(['url' => 'https://example.test', 'eventTypes' => [], 'batching' => ['enabled' => true, 'maxEvents' => 2, 'windowMs' => 100]]);
}
function officialRound2Text(string $value): void {}
