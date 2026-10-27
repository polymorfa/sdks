<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class S3ArchiveResult
{
    public function __construct(public string $bucket, public string $key, public int $bytes, public string $mimetype, public ?string $etag = null)
    {
    }
}
