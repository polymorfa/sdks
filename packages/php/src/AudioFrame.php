<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class AudioFrame
{
    /** @param list<int> $samples */
    public function __construct(public array $samples)
    {
    }
}
