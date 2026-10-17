<?php

declare(strict_types=1);

namespace Polymorfa;

/** Application-owned event adapter; missing retained payloads are skipped. No background scheduler is installed. */
final readonly class EventStreamSource
{
    /** @param \Closure(?string,CancellationToken):EventStream $open */
    public function __construct(private \Closure $open)
    {
    }
    /** @param callable(list<WebhookEvent>,array{cursor:string}):void $listener
     * @param ?callable(\Throwable):void $onError */
    public function subscribe(callable $listener, ?string $cursor = null, ?callable $onError = null, ?CancellationToken $cancellation = null): EventStreamSubscription
    {
        $token = $cancellation === null ? new CancellationToken() : CancellationToken::linked($cancellation);
        return new EventStreamSubscription(($this->open)($cursor, $token), $token, \Closure::fromCallable($listener), $onError === null ? null : \Closure::fromCallable($onError));
    }
}
