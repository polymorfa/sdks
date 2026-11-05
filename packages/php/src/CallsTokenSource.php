<?php

declare(strict_types=1);

namespace Polymorfa;

/** Cached credentials. Suspended Fiber providers advance when poll() is called. */
final class CallsTokenSource
{
    /** @var \Closure(CallsTokenRequest):(CallsToken|Credential) */
    private readonly \Closure $provider;
    /** @var \Closure():float */
    private readonly \Closure $now;
    private ?CallsToken $cached = null;
    private ?CallsTokenFetch $pending = null;
    /** @var list<CallsTokenFetch> */
    private array $fetches = [];
    private int $generation = 0;
    /** @param Credential|callable(CallsTokenRequest):(CallsToken|Credential) $provider
     * @param callable():float|null $now */
    public function __construct(Credential|callable $provider, private readonly float $expirySkew = 30, ?callable $now = null)
    {
        if (!is_finite($expirySkew) || $expirySkew < 0) {
            throw new ConfigurationException('expirySkew');
        }
        $this->provider = $provider instanceof Credential ? static fn (CallsTokenRequest $request): CallsToken => new CallsToken($provider) : \Closure::fromCallable($provider);
        $this->now = \Closure::fromCallable($now ?? static fn (): float => microtime(true));
    }
    public function invalidate(): void
    {
        $this->cached = null;
        ++$this->generation;
        $this->pending = null;
    }
    public function get(?CallsTokenRequest $request = null): CallsToken
    {
        $request ??= new CallsTokenRequest();
        $request->cancellation?->throwIfCancelled();
        $cached = $this->cached;
        if (!$request->refresh && $cached !== null && ($cached->expiresAt === null || $cached->expiresAt - $this->expirySkew > ($this->now)())) {
            return $cached;
        }
        if ($request->refresh) {
            $this->cached = null;
        }
        if ($this->pending === null || $this->pending->cancellation->isCancelled() || ($request->refresh && !$this->pending->refresh)) {
            $this->pending = new CallsTokenFetch($request->refresh, ++$this->generation, $this->provider);
            $this->fetches[] = $this->pending;
        }
        $entry = $this->pending;
        ++$entry->waiters;
        $entry->anchored = $entry->anchored || $request->cancellation === null;
        $fiber = \Fiber::getCurrent();
        if ($fiber !== null) {
            $entry->fibers[spl_object_id($fiber)] = $fiber;
        }
        try {
            while (!$entry->isDone()) {
                $request->cancellation?->throwIfCancelled();
                if ($fiber !== null) {
                    if (!$this->advance($entry)) {
                        \Fiber::suspend();
                    }
                } else {
                    $this->poll();
                    usleep(1000);
                }
            }
            $request->cancellation?->throwIfCancelled();
            if ($entry->error !== null) {
                throw $entry->error;
            }
            return $entry->result ?? throw new ConnectionException('Token provider returned no credential.', 'invalid_token');
        } finally {
            --$entry->waiters;
            if ($fiber !== null) {
                unset($entry->fibers[spl_object_id($fiber)]);
            }
            if (!$entry->done && $entry->waiters === 0 && !$entry->anchored) {
                $entry->cancellation->cancel();
                if ($this->pending === $entry) {
                    $this->pending = null;
                }
            }
            $this->fetches = array_values(array_filter($this->fetches, static fn (CallsTokenFetch $fetch): bool => !$fetch->done || $fetch->waiters > 0));
        }
    }
    /** Advance suspended providers and waiting callers; no global scheduler is installed. */
    public function poll(): void
    {
        foreach ($this->fetches as $entry) {
            foreach ($entry->fibers as $fiber) {
                if ($fiber->isSuspended()) {
                    $fiber->resume();
                }
            }
            $this->advance($entry);
            foreach ($entry->fibers as $fiber) {
                if ($fiber->isSuspended()) {
                    $fiber->resume();
                }
            }
        }
        $this->fetches = array_values(array_filter($this->fetches, static fn (CallsTokenFetch $entry): bool => !$entry->done || $entry->waiters > 0));
    }
    private function advance(CallsTokenFetch $entry): bool
    {
        if ($entry->done || $entry->fiber->isRunning()) {
            return $entry->done;
        }
        try {
            if (!$entry->fiber->isStarted()) {
                $entry->fiber->start();
            } elseif ($entry->fiber->isSuspended()) {
                $entry->fiber->resume();
            }
            if (!$entry->fiber->isTerminated()) {
                return false;
            }
            $entry->result = $entry->fiber->getReturn();
            if ($entry->generation === $this->generation && !$entry->cancellation->isCancelled()) {
                $this->cached = $entry->result;
            }
        } catch (\Throwable $error) {
            $entry->error = $error instanceof PolymorfaException ? $error : new ConnectionException('Calls token provider failed.', 'token_provider_failed');
        }
        $entry->done = true;
        if ($this->pending === $entry) {
            $this->pending = null;
        }
        return true;
    }
}
