<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class MediaDescriptor
{
    /** @param 'image'|'video'|'audio'|'document'|'sticker' $mediaKind */
    public function __construct(
        public string $mediaKind,
        #[\SensitiveParameter] public string $mediaKey,
        public ?string $url = null,
        public ?string $directPath = null,
        #[\SensitiveParameter] public ?string $fileSha256 = null,
        #[\SensitiveParameter] public ?string $fileEncSha256 = null,
        public ?int $fileLength = null,
        public ?string $mimetype = null,
        public ?string $fileName = null
    ) {
        if (!WhatsAppMedia::isKind($mediaKind) || strlen($mediaKey) !== 32
            || ($fileSha256 !== null && strlen($fileSha256) !== 32) || ($fileEncSha256 !== null && strlen($fileEncSha256) !== 32)
            || ($fileLength !== null && $fileLength < 0)) {
            throw new MediaIntegrityException('Invalid media descriptor.', 'media_invalid_descriptor');
        }
    }
    /** @return array{mediaKind:string,fileLength:?int,mimetype:?string} */
    public function __debugInfo(): array
    {
        return ['mediaKind' => $this->mediaKind,'fileLength' => $this->fileLength,'mimetype' => $this->mimetype];
    }
}
