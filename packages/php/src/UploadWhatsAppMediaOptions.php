<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\ClientInterface;

final readonly class UploadWhatsAppMediaOptions implements \JsonSerializable
{
    public function __construct(public string $mediaType, public ?string $mimeType = null, #[\SensitiveParameter] public ?string $mediaKey = null, public string $egress = 'relay', public int $maxBytes = WhatsAppMedia::MAX_BYTES, public ?RequestOptions $requestOptions = null, public ?ClientInterface $http = null, public int $maxAttempts = 3, public int $documentPartSize = 52428800, public ?WhatsAppMediaUploadTransport $uploadTransport = null)
    {
        if (!in_array($mediaType, ['image','video','audio','ptt','document','sticker'], true)) {
            throw new ConfigurationException('mediaType');
        }
        if (!in_array($egress, ['relay','direct'], true)) {
            throw new ConfigurationException('egress');
        }
        if ($mediaKey !== null && strlen($mediaKey) !== 32) {
            throw new ConfigurationException('mediaKey');
        }
        if ($maxBytes < 1 || $maxBytes > 9007199254740991) {
            throw new ConfigurationException('maxBytes');
        }
        if ($maxAttempts < 1 || $maxAttempts > 100) {
            throw new ConfigurationException('maxAttempts');
        }
        if ($documentPartSize < 1 || $documentPartSize > 67108864) {
            throw new ConfigurationException('documentPartSize');
        }
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
