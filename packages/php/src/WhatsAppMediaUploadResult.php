<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class WhatsAppMediaUploadResult implements \JsonSerializable
{
    public function __construct(public EncryptedMediaInfo $info, public WhatsAppUploadLocation $location, public string $egress)
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
