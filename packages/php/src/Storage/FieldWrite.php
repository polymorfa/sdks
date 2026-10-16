<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final readonly class FieldWrite
{
    public function __construct(public mixed $value, public int|float $version)
    {
    }
    /**
     * @return array{version:int|float,redacted:bool} */
    public function __debugInfo(): array
    {
        return ['version' => $this->version, 'redacted' => true];
    }
}
