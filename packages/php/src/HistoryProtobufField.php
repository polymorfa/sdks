<?php

declare(strict_types=1);

namespace Polymorfa;

/** Original field bytes are retained, including unknown fields and groups.
 * integer is null for unsigned values larger than PHP_INT_MAX; value retains
 * the exact varint, so no integer passes through a float. */
final readonly class HistoryProtobufField implements \JsonSerializable
{
    public function __construct(public int $number, public int $wireType, #[\SensitiveParameter] public string $raw, #[\SensitiveParameter] public string $value, public ?int $integer = null)
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
