<?php

declare(strict_types=1);

namespace Polymorfa;

/** A cooperative subscription: pump drives the synchronous iterator, close releases its active body. */
final class EventStreamSubscription
{
    private bool $closed = false;
    /** @param \Closure(list<WebhookEvent>,array{cursor:string}):void $listener
     * @param ?\Closure(\Throwable):void $onError */
    public function __construct(private readonly EventStream $stream, private readonly CancellationToken $cancellation, private readonly \Closure $listener, private readonly ?\Closure $onError)
    {
    }
    public function close(): void
    {
        $this->closed = true;
        $this->cancellation->cancel();
        $this->stream->close();
    }
    public function isClosed(): bool
    {
        return $this->closed;
    }
    public function metadata(): ?ResponseMetadata
    {
        return $this->stream->metadata;
    }
    public function pump(): void
    {
        if ($this->isClosed()) {
            return;
        }
        try {
            foreach ($this->stream as $item) {
                if ($this->isClosed() || $this->cancellation->isCancelled()) {
                    return;
                }
                if ($item['webhook'] !== null) {
                    ($this->listener)([$item['webhook']], ['cursor' => $item['cursor']]);
                }
            }
        } catch (\Throwable $error) {
            if (!$this->isClosed() && !$this->cancellation->isCancelled()) {
                if ($this->onError !== null) {
                    ($this->onError)($error);
                } else {
                    throw $error;
                }
            }
        } finally {
            $this->close();
        }
    }
}
