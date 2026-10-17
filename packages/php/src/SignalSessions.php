<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class SignalSessions implements \JsonSerializable
{
    /** @param list<SignalSessionInfo> $sessions */public function __construct(public string $nodeId, public array $sessions)
    {
    }
    /** @return array{redacted:true} */public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
