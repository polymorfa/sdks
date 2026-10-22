<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class SignalSendOutcome
{
    public function __construct(public string $messageId, public int $serverTimestamp, public bool $resent)
    {
    }
}
