<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\{CancellationToken,CancelledException,HistorySyncData,WebhookEvent};

/** Cooperative PHP synchronization. No background thread or automatic ACK. */
final class Sync
{
    private bool $closed = false;
    private readonly CancellationToken $cancellation;
    private readonly WebhookHandler $handler;
    /**
     * @param (\Closure(WebhookEvent):(array<string,mixed>|HistorySyncData|null))|null $decodeHistory
     *
     * @param ?\Closure(array{webhook:?WebhookEvent,cursor:string,streamId:string,sequence:int},ApplyResult):void $onApplied */
    public function __construct(private readonly SyncSource $source, private readonly Engine $storage, private readonly string $checkpointSessionId = '*', private readonly string $checkpointStream = 'events', private readonly bool $requirePayload = true, ?\Closure $decodeHistory = null, private readonly ?\Closure $onApplied = null, ?CancellationToken $cancellation = null)
    {
        $this->cancellation = $cancellation === null ? new CancellationToken() : CancellationToken::linked($cancellation);
        $this->handler = new WebhookHandler($storage, $decodeHistory);
    }
    public function isClosed(): bool
    {
        return $this->closed;
    }
    public function close(): void
    {
        $this->closed = true;
        $this->cancellation->cancel();
        $this->source->close();
    }
    public function pump(): void
    {
        if ($this->closed) {
            return;
        }
        try {
            $this->cancellation->throwIfCancelled();
            $saved = $this->storage->getCheckpoint($this->checkpointSessionId, $this->checkpointStream);
            $expected = $saved['cursor'] ?? null;
            if ($expected !== null && !is_string($expected)) {
                Schema::invalid();
            }
            foreach ($this->source->open($expected, $this->cancellation) as $item) {
                if ($this->closed) {
                    break;
                } $this->cancellation->throwIfCancelled();
                if ($item['cursor'] === '' || $item['streamId'] === '' || $item['sequence'] < 0) {
                    Schema::invalid();
                }
                if ($item['webhook'] === null && $this->requirePayload) {
                    throw new StorageException('storage_payload_unavailable');
                }
                $result = $item['webhook'] === null ? new ApplyResult(false, 0) : ($this->handler)($item['webhook'], $this->cancellation);
                $this->storage->apply(new Batch($this->checkpointSessionId, [new Checkpoint($this->checkpointSessionId, $this->checkpointStream, $item['cursor'], expectedCursor:$expected, updatedAt:microtime(true) * 1000)]), $this->cancellation);
                $expected = $item['cursor'];
                $this->source->acknowledge($item['streamId'], $item['cursor'], $item['sequence'], $this->cancellation);
                if ($this->onApplied !== null) {
                    ($this->onApplied)($item, $result);
                }
            }
        } catch (CancelledException $e) {
            if (!$this->isClosed()) {
                throw $e;
            }
        } finally {
            $this->close();
        }
    }
}
