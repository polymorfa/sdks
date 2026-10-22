<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final readonly class Batch
{
    /**
     * @param list<Upsert|Delete|ClearChat|Checkpoint> $operations */
    public function __construct(public string $sessionId, public array $operations, public ?string $eventId = null, public ?string $eventType = null)
    {
    }
}
