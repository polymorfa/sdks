<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal One shared provider invocation; callers own independent cancellation. */
final class CallsTokenFetch
{
    public readonly CancellationToken $cancellation;
    /** @var \Fiber<null,null,CallsToken,void> */
    public readonly \Fiber $fiber;
    public ?CallsToken $result = null;
    public ?\Throwable $error = null;
    public bool $done = false;
    public int $waiters = 0;
    public bool $anchored = false;
    /** @var array<int,\Fiber<mixed,mixed,mixed,mixed>> */
    public array $fibers = [];
    public function isDone(): bool
    {
        return $this->done;
    }
    /** @param \Closure(CallsTokenRequest):(CallsToken|Credential) $provider */
    public function __construct(public readonly bool $refresh, public readonly int $generation, \Closure $provider)
    {
        $this->cancellation = new CancellationToken();
        $this->fiber = new \Fiber(function () use ($provider): CallsToken {
            $value = $provider(new CallsTokenRequest($this->refresh, $this->cancellation));
            $this->cancellation->throwIfCancelled();
            return $value instanceof CallsToken ? $value : new CallsToken($value);
        });
    }
}
