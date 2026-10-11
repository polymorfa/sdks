<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class VideoFrame
{
    public function __construct(public string $data, public int $timestampUs, public bool $keyframe = false, public int $source = 0)
    {
    }
}
