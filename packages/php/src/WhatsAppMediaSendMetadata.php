<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class WhatsAppMediaSendMetadata
{
    public function __construct(public ?string $mimeType = null, public ?string $thumbnail = null, public ?int $width = null, public ?int $height = null, public ?int $seconds = null, public ?string $waveform = null, public ?int $mediaKeyTimestamp = null, public ?bool $isAnimated = null)
    {
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
