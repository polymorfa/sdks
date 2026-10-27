<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final readonly class Checkpoint
{
    public function __construct(public string $sessionId, public string $stream, public string $cursor, public mixed $position = null, public string|null|Unspecified $expectedCursor = Unspecified::Value, public int|float|null $updatedAt = null)
    {
    }
}
