<?php

declare(strict_types=1);

namespace Polymorfa;

/** @phpstan-import-type KnownEvent from WebhookModels */
final readonly class WebhookEvent
{
    /**
 * @param array<string,mixed> $raw */
    public function __construct(
        public string $id,
        public string $session,
        public string $timestamp,
        public string $event,
        public mixed $payload,
        public array $raw,
        public bool $known,
        public ?string $externalId = null
    ) {
    }
    /** Typed view of known event names, not a general payload schema validator.
     * Signed/verified parsing narrowly validates projected descriptor history. Raw forward fields remain available.
     * @return KnownEvent|null */
    public function knownEvent(): ?array
    {
        if (!$this->known) {
            return null;
        }
        /** @var KnownEvent $event */
        $event = $this->raw;
        return $event;
    }
    /**
 *
 * @return array{id:string,session:string,timestamp:string,event:string,known:bool} */
    public function __debugInfo(): array
    {
        return ['id' => $this->id, 'session' => $this->session, 'timestamp' => $this->timestamp, 'event' => $this->event, 'known' => $this->known];
    }
}
