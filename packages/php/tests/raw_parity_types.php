<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{Client,RawCursorPage,ResponseMetadata,GraphTransport,RequestOptions};

final class RawParityTypes
{
    public static function consumer(Client $client): void
    {
        $page = $client->raw->paginate('GET', '/custom', static function (mixed $data, ResponseMetadata $metadata): array {
            if (!is_array($data)) {
                throw new \RuntimeException('Expected array');
            }
            return ['items' => array_values(array_map(static fn (mixed $item): string => (string)$item, $data))];
        }, options:new RequestOptions(headers:GraphTransport::headers('linked_devices')));
        self::consume($page);
    }
    /** @param RawCursorPage<string> $page */
    private static function consume(RawCursorPage $page): void
    {
        foreach ($page as $item) {
            self::text($item);
        }
        $next = $page->nextPage();
        if ($next !== null) {
            self::consume($next);
        }
    }
    private static function text(string $value): void
    {
    }
}
