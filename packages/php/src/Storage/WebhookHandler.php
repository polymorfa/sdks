<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\{CancellationToken,HistorySyncData,WebhookEvent};

/** Call only after the owning webhook boundary has verified its signature. */
final readonly class WebhookHandler
{
    /**
     * @param (\Closure(WebhookEvent):(array<string,mixed>|HistorySyncData|null))|null $decodeHistory
     * @param (\Closure(array<string,mixed>,WebhookEvent):(array<string,mixed>|HistorySyncData))|null $decodeHistoryDescriptor */
    public function __construct(private Engine $storage, private ?\Closure $decodeHistory = null, private ?\Closure $decodeHistoryDescriptor = null, private HistoryDescriptorMode $historyDescriptorMode = HistoryDescriptorMode::Decode)
    {
    }
    public function __invoke(WebhookEvent $event, ?CancellationToken $cancellation = null): ApplyResult
    {
        $payload = Reduction::record($event->payload);
        if ($event->event === 'history.sync' && array_key_exists('delivery', $payload)) {
            HistoryDescriptor::validate($payload);
            if ($this->storage->hasEvent($event->session, $event->id)) {
                return new ApplyResult(false, 0);
            }
            $batch = EventReducer::reduce($event);
            if ($this->historyDescriptorMode === HistoryDescriptorMode::MetadataOnly) {
                return $this->storage->apply($batch, $cancellation);
            }
            if ($this->decodeHistoryDescriptor === null) {
                throw new StorageException('storage_history_descriptor_decoder_required');
            }
            try {
                $chunk = ($this->decodeHistoryDescriptor)($payload, $event);
                HistoryDescriptor::validateChunk($chunk);
                $history = HistoryReducer::reduce($event->session, $chunk, new HistoryIdentityIndex());
            } catch (\Throwable) {
                throw new StorageException('storage_history_descriptor_decode_failed');
            }
            return $this->storage->apply(new Batch($batch->sessionId, [...$history->operations,...$batch->operations], $batch->eventId, $batch->eventType), $cancellation);
        }
        $batch = EventReducer::reduce($event);
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
