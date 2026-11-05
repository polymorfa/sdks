<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class CallsTokenRequest
{
    public function __construct(public bool $refresh = false, public ?CancellationToken $cancellation = null)
    {
    }
}
