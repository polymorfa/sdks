<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class WhatsAppUploadLocation implements \JsonSerializable
{
    public function __construct(#[\SensitiveParameter] public string $directPath, #[\SensitiveParameter] public string $url, #[\SensitiveParameter] public ?string $handle = null)
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
