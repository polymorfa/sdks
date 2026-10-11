<?php

declare(strict_types=1);

namespace Polymorfa;

use Psr\Http\Message\StreamInterface;

final readonly class WhatsAppDownload
{
    public string $mediaKind;
    public string $mimetype;
    public ?string $fileName;
    public ?int $fileLength;
    public function __construct(public StreamInterface $body, MediaDescriptor $descriptor)
    {
        $this->mediaKind = $descriptor->mediaKind;
        $this->mimetype = $descriptor->mimetype ?? 'application/octet-stream';
        $this->fileName = $descriptor->fileName;
        $this->fileLength = $descriptor->fileLength;
    }
    public function bytes(): string
    {
        try {
            return $this->body->getContents();
        } finally {
            $this->body->close();
        }
    }
    public function writeToFile(string $destination, bool $overwrite = true, int $maxBytes = WhatsAppMedia::MAX_BYTES, ?CancellationToken $cancellation = null): int
    {
        return MediaFiles::write($this->body, $destination, $overwrite, $maxBytes, $cancellation);
    }
    public function close(): void
    {
        $this->body->close();
    }
    /** @return array{mediaKind:string,mimetype:string,fileName:?string,fileLength:?int} */
    public function __debugInfo(): array
    {
        return ['mediaKind' => $this->mediaKind,'mimetype' => $this->mimetype,'fileName' => $this->fileName,'fileLength' => $this->fileLength];
    }
}
