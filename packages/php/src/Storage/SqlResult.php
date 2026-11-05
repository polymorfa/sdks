<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final readonly class SqlResult
{
    /**
     * @param list<array<string,mixed>> $rows */
    public function __construct(public array $rows = [], public int $affected = 0)
    {
    }
}
