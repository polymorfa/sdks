<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class HistorySyncMessage implements \JsonSerializable
{
    /** @param list<HistoryProtobufField> $fields
     * messageOrderVarint retains unsigned 64-bit values without float conversion. */
    public function __construct(#[\SensitiveParameter] public string $protobuf, public array $fields, #[\SensitiveParameter] public ?string $messageProtobuf, public ?string $messageOrderVarint)
    {
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */
    public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
