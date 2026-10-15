<?php

declare(strict_types=1);

namespace Polymorfa;

use Polymorfa\Resources\WhatsAppMedia;

/** @internal Reuses the resource's existing relay/direct policy. */
final readonly class BuiltinWhatsAppMediaUploadTransport implements WhatsAppMediaUploadTransport, \JsonSerializable
{
    public function __construct(private WhatsAppMedia $resource, private string $mode, private UploadWhatsAppMediaOptions $options)
    {
    }
    public function name(): string
    {
        return $this->mode;
    }
    public function upload(string $session, WhatsAppEncryptedUploadBody $body): WhatsAppUploadLocation
    {
        return $body->uploadUsing($this->resource, $session, $this->mode, $this->options);
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
