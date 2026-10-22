<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class HistorySyncChunkDescriptor implements \JsonSerializable
{
    public function __construct(#[\SensitiveParameter] public string $directPath, #[\SensitiveParameter] public string $mediaKey, #[\SensitiveParameter] public string $fileSha256, #[\SensitiveParameter] public string $fileEncSha256, public ?int $fileLength = null)
    {
        if (strlen($mediaKey) !== 32 || strlen($fileSha256) !== 32 || strlen($fileEncSha256) !== 32 || ($fileLength !== null && $fileLength < 0)) {
            throw new MediaIntegrityException('Invalid history descriptor.', 'media_invalid_descriptor');
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
