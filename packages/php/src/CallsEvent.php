<?php

declare(strict_types=1);

namespace Polymorfa;

/** A typed event envelope. Native PCM/video values retain their dedicated classes. */
final readonly class CallsEvent
{
    public function __construct(
        public string $type,
        public ?Call $call = null,
        public AudioFrame|VideoFrame|CallReaction|CallParticipant|CallVideoSource|PolymorfaException|int|null $value = null
    ) {
    }
}
