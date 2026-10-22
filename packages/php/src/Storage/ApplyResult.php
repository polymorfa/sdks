<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final readonly class ApplyResult
{
    public function __construct(public bool $applied, public int $writes)
    {
    }
}
