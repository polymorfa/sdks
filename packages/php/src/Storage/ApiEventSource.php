<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\{CancellationToken,EventStream,EventStreamOptions,RequestOptions,WebhookEvent};
use Polymorfa\Resources\Events;

/** Native project event source; a retention gap fails before cursor/ACK advancement. */
final class ApiEventSource implements SyncSource
{
    private ?EventStream $active = null;
    /**
     * @param list<string> $types */
    public function __construct(private readonly Events $events, private readonly ?string $projectId = null, private readonly array $types = EventReducer::TYPES, private readonly ?RequestOptions $options = null)
    {
    }
    private function options(CancellationToken $cancel): RequestOptions
    {
        $o = $this->options ?? new RequestOptions();
        return new RequestOptions($o->timeout, $o->maxNetworkRetries, $o->apiVersion, $o->idempotencyKey, $o->headers, $o->cancellation === null ? $cancel : CancellationToken::linked($cancel, $o->cancellation));
    }
    /**
     * @return iterable<array{webhook:?WebhookEvent,cursor:string,streamId:string,sequence:int}> */
    public function open(?string $cursor, CancellationToken $cancellation): iterable
    {
        $this->active = $this->events->stream($this->projectId, $cursor, $this->types, true, $this->options($cancellation), new EventStreamOptions(onGap:static function (array $gap): never {
            throw new StorageException('storage_stream_gap');
        }));
        return $this->active;
    }
    public function acknowledge(string $streamId, string $cursor, int $sequence, CancellationToken $cancellation): void
    {
        $this->events->acknowledgeStream($streamId, $cursor, $sequence, $this->projectId, $this->options($cancellation));
    }
    public function close(): void
    {
        $this->active?->close();
        $this->active = null;
    }
}
