<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class MediaDownloadUrl
{
    public function __construct(public bool $streamed, #[\SensitiveParameter] public ?string $url, public ?\DateTimeImmutable $expiresAt, public ResponseMetadata $metadata)
    {
    }
    /** @return array{streamed:bool,expiresAt:?\DateTimeImmutable,metadata:ResponseMetadata} */
    public function __debugInfo(): array
    {
        return ['streamed' => $this->streamed,'expiresAt' => $this->expiresAt,'metadata' => $this->metadata];
    }
}
