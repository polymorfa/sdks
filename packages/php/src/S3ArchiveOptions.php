<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\ClientInterface;

final readonly class S3ArchiveOptions implements \JsonSerializable
{
    /** @param array<string,string> $metadata */
    public function __construct(public string $key, #[\SensitiveParameter] public array $metadata = [], public ?string $scratchDirectory = null, public int $maxBytes = WhatsAppMedia::MAX_BYTES, public ?RequestOptions $requestOptions = null, public ?ClientInterface $http = null)
    {
        if ($key === '' || $maxBytes < 1 || $maxBytes > 9007199254740991 || $scratchDirectory === '') {
            throw new ConfigurationException('s3Archive');
        }
    }
    /** @return array{redacted:true} */ public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */ public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
