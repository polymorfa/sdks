<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\Storage\{Adapter,D1Bridge,Schema};

final class StorageTypes
{
    public static function consumer(D1Bridge $bridge): void
    {
        self::adapter($bridge);
        $row = ['connectionId' => 'connection','_id' => Schema::encodeKey('connections', ['connectionId' => 'connection']),'_rev' => 1,'_v' => []];
        $result = $bridge->commit([['kind' => 'put','entity' => 'connections','row' => $row,'expectedRev' => null]]);
        if (!$result['ok']) {
            foreach ($result['conflicts'] as $id) {
                self::text($id);
            }
        }
        foreach ($bridge->get('connections', [$row['_id']]) as $id => $stored) {
            self::text($id);
        }
    }
    private static function adapter(Adapter $adapter): void
    {
    }
    private static function text(string $value): void
    {
    }
}
