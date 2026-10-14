<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\{CancellationToken,HistorySyncData,WebhookEvent};

/** Call only after the owning webhook boundary has verified its signature. */
final readonly class WebhookHandler
{
    /**
     * @param (\Closure(WebhookEvent):(array<string,mixed>|HistorySyncData|null))|null $decodeHistory */
    public function __construct(private Engine $storage, private ?\Closure $decodeHistory = null)
    {
    }
    public function __invoke(WebhookEvent $event, ?CancellationToken $cancellation = null): ApplyResult
    {
        $batch = EventReducer::reduce($event);
        $payload = Reduction::record($event->payload);
        if ($event->event === 'history.sync' && ($payload['kind'] ?? null) !== 'history' && $this->decodeHistory !== null) {
            if ($this->storage->hasEvent($event->session, $event->id)) {
                return new ApplyResult(false, 0);
            }
            $chunk = ($this->decodeHistory)($event);
            if ($chunk !== null) {
                $history = HistoryReducer::reduce($event->session, $chunk, HistoryIdentityIndex::fromPayload($payload));
                $batch = new Batch($batch->sessionId, [...$history->operations,...$batch->operations], $batch->eventId, $batch->eventType);
            }
        }
        return $this->storage->apply($batch, $cancellation);
    }
}
