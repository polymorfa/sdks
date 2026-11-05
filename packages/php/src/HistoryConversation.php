<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class HistoryConversation implements \JsonSerializable
{
    /** @param list<HistoryProtobufField> $fields
     * @param list<HistorySyncMessage> $messages */
    public function __construct(#[\SensitiveParameter] public string $id, #[\SensitiveParameter] public string $protobuf, public array $fields, public array $messages)
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
