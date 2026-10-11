<?php

declare(strict_types=1);

namespace Polymorfa;

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
        public bool $known
    ) {
    }
    /**
 *
 * @return array{id:string,session:string,timestamp:string,event:string,known:bool} */
    public function __debugInfo(): array
    {
        return ['id' => $this->id, 'session' => $this->session, 'timestamp' => $this->timestamp, 'event' => $this->event, 'known' => $this->known];
    }
}
