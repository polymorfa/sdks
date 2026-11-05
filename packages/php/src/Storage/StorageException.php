<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final class StorageException extends \RuntimeException
{
    public function __construct(public readonly string $errorCode)
    {
        parent::__construct('Customer-owned storage operation failed ('.$errorCode.').');
    }
}
