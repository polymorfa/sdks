<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final readonly class Delete
{
    /**
     * @param array<string,string> $key */
    public function __construct(public string $entity, public array $key)
    {
    }
}
