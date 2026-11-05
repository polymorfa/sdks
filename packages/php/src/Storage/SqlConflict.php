<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** @internal */
final class SqlConflict extends \RuntimeException
{
    public function __construct(public readonly string $identity)
    {
        parent::__construct('Conditional storage write failed.');
    }
}
