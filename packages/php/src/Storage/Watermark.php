<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

final readonly class Watermark
{
    public function __construct(public string $sessionId, public string $chatId, public int|float $timestamp)
    {
    }
}
