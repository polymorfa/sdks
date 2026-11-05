<?php

declare(strict_types=1);
namespace Polymorfa;
/** Beta. Acknowledge the entire request; deduplicate batch and member IDs. */
final readonly class WebhookEventBatch
{
    public string $object;
    public int $version;
    /** @param list<WebhookEvent> $events */
    public function __construct(public string $id, public array $events) { $this->object = 'event_batch'; $this->version = 1; }
}
