<?php

declare(strict_types=1);

namespace Polymorfa;

use Psr\Http\Message\StreamInterface;

/** @implements \IteratorAggregate<int,SignalEvent> */
final class SignalEventStream implements \IteratorAggregate, \JsonSerializable
{
    private bool $started = false;
    private bool $closed = false;
    public function __construct(private readonly StreamInterface $body, private readonly ?string $sessionId, private readonly ?CancellationToken $cancellation)
    {
    }
    public function close(): void
    {
        $this->closed = true;
        $this->body->close();
    }
    /** @phpstan-impure */private function ended(): bool
    {
        return $this->body->eof();
    }
    /** @return \Traversable<int,SignalEvent> */
    public function getIterator(): \Traversable
    {
        if ($this->started) {
            throw new ConfigurationException('signalStream');
        }$this->started = true;
        $parser = new SignalSseParser();
        try {
            while (!$this->closed && !$this->ended()) {
                $this->cancellation?->throwIfCancelled();
                try {
                    $available = $this->body->getMetadata('unread_bytes');
                    $chunk = $this->body->read(is_int($available) && $available > 0 ? min($available, 4096) : 1);
                } catch (\RuntimeException) {
                    if ($this->body->getMetadata('timed_out') === true) {
                        continue;
                    }throw new SignalSidecarException('The Signal sidecar event stream could not be read.', 'signal_sidecar_connection_failed');
                }
                if ($chunk === '') {
                    continue;
                }
                foreach ($parser->feed($chunk) as $frame) {
                    $event = SignalEvent::fromJson($frame['data']);
                    if ($event->id !== $frame['id'] || $event->type !== $frame['type'] || ($this->sessionId !== null && $this->sessionId !== '' && $event->sessionId !== $this->sessionId)) {
                        SignalCodec::invalid();
                    }yield $event;
                }
            }$this->cancellation?->throwIfCancelled();
            if (!$this->closed) {
                throw new SignalSidecarException('The Signal sidecar event stream closed.', 'signal_sidecar_stream_closed');
            }
        } finally {
            $this->close();
        }
    }
    /** @return array{redacted:true} */public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }

}
