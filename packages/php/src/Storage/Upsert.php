<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

readonly class Upsert
{
    /**
     * @param array<string,string> $key
     * @param array<string,FieldWrite> $fields */
    public function __construct(public string $entity, public array $key, public array $fields, public ?Watermark $guard = null)
    {
    }
}
