<?php

declare(strict_types=1);

namespace Polymorfa;

/** Handwritten core view; protobuf and fields preserve the full pinned proto2
 * message, while decoded contains an optional caller's complete-schema model. */
final readonly class HistorySyncData implements \JsonSerializable
{
    /** @param list<HistoryProtobufField> $fields
     * @param list<HistoryConversation> $conversations */
    public function __construct(#[\SensitiveParameter] public string $protobuf, public array $fields, public int $syncType, public ?int $chunkOrder, public ?int $progress, public array $conversations, public mixed $decoded = null)
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
