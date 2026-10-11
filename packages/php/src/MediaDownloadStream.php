<?php

declare(strict_types=1);

namespace Polymorfa;

use Psr\Http\Message\StreamInterface;

final readonly class MediaDownloadStream
{
    public function __construct(public StreamInterface $body, public ResponseMetadata $metadata, public bool $redirected = false, public ?string $contentType = null, public ?int $contentLength = null, public ?string $filename = null)
    {
    }
    public function close(): void
    {
        $this->body->close();
    }
    /** @return array{metadata:ResponseMetadata,redirected:bool,contentType:?string,contentLength:?int,filename:?string} */
    public function __debugInfo(): array
    {
        return ['metadata' => $this->metadata,'redirected' => $this->redirected,'contentType' => $this->contentType,'contentLength' => $this->contentLength,'filename' => $this->filename];
    }
}
