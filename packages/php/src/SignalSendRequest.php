<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class SignalSendRequest implements \JsonSerializable
{
    public function __construct(#[\SensitiveParameter] public string $to, #[\SensitiveParameter] public ?string $text = null, public ?SignalMediaDescriptor $media = null)
    {
        if ($to === '' || ($text === null) === ($media === null) || $text === '') {
            throw new ConfigurationException('signalSend');
        }$media?->validateSend();
    }
    /** @return array<string,mixed> Explicit secret-bearing send fields; do not log. */public function toWire(): array
    {
        return ['to' => $this->to] + ($this->text !== null ? ['text' => $this->text] : ['media' => $this->media?->toWire()]);
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
