<?php

declare(strict_types=1);

namespace Polymorfa;

/** Hashes and lengths are public; mediaKey is a customer-held decryption secret. */
final readonly class EncryptedMediaInfo implements \JsonSerializable
{
    public function __construct(
        public string $mediaType,
        #[\SensitiveParameter] public string $mediaKey,
        public string $fileSha256,
        public string $fileEncSha256,
        public int $fileLength,
        public int $encryptedLength,
        public ?string $mimeType = null,
    ) {
    }
    /** @return array{mediaType:string,fileSha256:string,fileEncSha256:string,fileLength:int,encryptedLength:int,mimeType:?string} */
    public function jsonSerialize(): array
    {
        return ['mediaType' => $this->mediaType,'fileSha256' => base64_encode($this->fileSha256),'fileEncSha256' => base64_encode($this->fileEncSha256),'fileLength' => $this->fileLength,'encryptedLength' => $this->encryptedLength,'mimeType' => $this->mimeType];
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
