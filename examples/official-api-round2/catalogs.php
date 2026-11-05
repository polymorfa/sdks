<?php

declare(strict_types=1);

function nextCatalogCursor(\Polymorfa\MessagingClient $client): ?string
{
    $page = $client->catalogs->listProducts('number-id', '123', ['limit' => 100, 'cursor' => 'opaque_-']);
    return $page->data['data']['nextCursor'] ?? null;
}
