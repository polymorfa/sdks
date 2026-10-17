<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class CallVideoSource
{
    public function __construct(
        public int $id,
        public string $label,
        public ?CallParticipant $participant = null,
        public ?string $connectionId = null,
        public ?string $connectionParticipant = null
    ) {
    }
}
