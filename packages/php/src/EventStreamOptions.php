<?php

declare(strict_types=1);

namespace Polymorfa;

/** @phpstan-type Gap array{reason:'retention_exceeded',missedEvents:int,requestedCursor:?string} */
final readonly class EventStreamOptions
{
    /** @var ?\Closure(array{reason:'retention_exceeded',missedEvents:int,requestedCursor:?string}):void */
    public ?\Closure $onGap;
    /** @var ?\Closure(\Throwable,float):void */
    public ?\Closure $onReconnect;
    /**
     * @param ?callable(array{reason:'retention_exceeded',missedEvents:int,requestedCursor:?string}):void $onGap
     * @param ?callable(\Throwable,float):void $onReconnect Delay is in seconds.
     */
    public function __construct(public float $initialDelay = 1, public float $maxDelay = 30, ?callable $onGap = null, ?callable $onReconnect = null)
    {
        if (!is_finite($initialDelay) || !is_finite($maxDelay) || $initialDelay < 0 || $maxDelay < $initialDelay) {
            throw new ConfigurationException('reconnect');
        }
        $this->onGap = $onGap === null ? null : \Closure::fromCallable($onGap);
        $this->onReconnect = $onReconnect === null ? null : \Closure::fromCallable($onReconnect);
    }
}
