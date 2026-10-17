<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class WhatsAppUploadGrant implements \JsonSerializable
{
    public function __construct(public string $host, #[\SensitiveParameter] public string $uploadUrl, public int $expiresAt)
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
