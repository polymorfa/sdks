<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type EncodedPayload from DeveloperModels
 * @phpstan-type StreamedEvent array{id:string,organizationId:string,projectId:string,type:string,source:'runtime'|'platform'|'test',environment:'development'|'production',createdAt:string,payloadAvailability:'available'|'not_retained'|'unavailable',payload:EncodedPayload|null,replayableUntil:?string,metadataExpiresAt:string}
 * @implements \IteratorAggregate<int,array{event:StreamedEvent,webhook:?WebhookEvent,cursor:string,streamId:string,sequence:int}> */
final class EventStream implements \IteratorAggregate
{
    private bool $closed = false;
    private ?\Psr\Http\Message\StreamInterface $activeBody = null;
    public ?ResponseMetadata $metadata = null;
    public ?string $cursor;
    /**
 * @param list<string> $types */
    public function __construct(
        private readonly HttpTransport $transport,
        public readonly string $path,
        ?string $since = null,
        private readonly array $types = [],
        private readonly bool $manualAck = false,
        private readonly ?RequestOptions $options = null,
        private readonly ?EventStreamOptions $streamOptions = null
    ) {
        $this->cursor = $since;
    }
    public function isClosed(): bool
    {
        return $this->closed;
    }
    public function close(): void
    {
        $this->closed = true;
        $this->activeBody?->close();
    }
    /**
 *
 * @return \Traversable<int,array{event:StreamedEvent,webhook:?WebhookEvent,cursor:string,streamId:string,sequence:int}> */
    public function getIterator(): \Traversable
    {
        if ($this->closed) {
            return;
        }
        yield from $this->iterate();
    }
    /**
     * @return \Traversable<int,array{event:StreamedEvent,webhook:?WebhookEvent,cursor:string,streamId:string,sequence:int}>
     */
    private function iterate(): \Traversable
    {
        $attempt = 0;
        $index = 0;
        $options = $this->options ?? new RequestOptions();
        $settings = $this->streamOptions ?? new EventStreamOptions();
        while (!$this->isClosed() && !$options->cancellation?->isCancelled()) {
            $headers = array_replace($options->headers, $this->cursor === null ? [] : ['Last-Event-ID' => $this->cursor]);
            $requestOptions = new RequestOptions($options->timeout, 0, $options->apiVersion, null, $headers, $options->cancellation);
            $query = ($this->types === [] ? [] : ['types' => implode(',', $this->types)]) + ($this->manualAck ? ['ack' => 'manual'] : []);
            $failure = new ConnectionException('Event stream connection closed.', 'stream_closed');
            $serverDelay = null;
            try {
                [$response, $metadata] = $this->transport->openStream('GET', $this->path, $query, options: $requestOptions, accept: 'text/event-stream', readTimeout: 0.25);
                $this->metadata = $metadata;
                $body = $response->getBody();
                $this->activeBody = $body;
                try {
                    if (trim(explode(';', $response->getHeaderLine('Content-Type'))[0]) !== 'text/event-stream') {
                        throw new ServerException('Expected an event stream.', 'invalid_response', metadata: $metadata);
                    }
                    $parser = new SseParser();
                    $heartbeat = 15.0;
                    $lastRead = microtime(true);
                    while (!$this->isClosed() && !$options->cancellation?->isCancelled() && !self::ended($body)) {
                        if (microtime(true) - $lastRead >= $heartbeat * 2) {
                            throw new ConnectionException('Event stream heartbeat missed.', 'heartbeat_missed', metadata: $metadata);
                        }
                        try {
                            $chunk = $body->read(4096);
                        } catch (\RuntimeException) {
                            if ($body->getMetadata('timed_out') === true) {
                                continue;
                            }
                            throw new ConnectionException('Event stream body could not be read.', 'connection_error', metadata: $metadata);
                        }
                        if ($chunk === '') {
                            continue;
                        }
                        $lastRead = microtime(true);
                        foreach ($parser->feed($chunk) as $bytes) {
                            if ($this->isClosed() || $options->cancellation?->isCancelled()) {
                                return;
                            }
                            try {
                                $frame = json_decode($bytes, true, 512, JSON_THROW_ON_ERROR);
                            } catch (\JsonException) {
                                throw new ServerException('Invalid event stream frame.', 'invalid_response', metadata: $metadata);
                            }
                            if (!is_array($frame)) {
                                throw new ServerException('Invalid event stream frame.', 'invalid_response', metadata: $metadata);
                            }
                            $kind = $frame['type'] ?? null;
                            if ($kind === 'ready') {
                                $interval = $frame['heartbeatIntervalMs'] ?? null;
                                if ((is_int($interval) || is_float($interval)) && is_finite((float)$interval) && $interval > 0) {
                                    $heartbeat = $interval / 1000;
                                }
                            } elseif ($kind === 'checkpoint' && isset($frame['cursor']) && is_string($frame['cursor'])) {
                                $this->cursor = $frame['cursor'];
                            } elseif ($kind === 'event') {
                                if (!isset($frame['event'], $frame['cursor'], $frame['sequence'], $frame['streamId']) || !is_array($frame['event']) || !is_string($frame['cursor']) || !is_int($frame['sequence']) || !is_string($frame['streamId'])) {
                                    throw new ServerException('Invalid streamed event.', 'invalid_response', metadata: $metadata);
                                }
                                $this->cursor = $frame['cursor'];
                                $attempt = 0;
                                $webhook = null;
                                if (($frame['event']['payload'] ?? null) !== null) {
                                    try {
                                        $encoded = $frame['event']['payload'];
                                        $payload = is_array($encoded) && is_string($encoded['data'] ?? null) ? base64_decode($encoded['data'], true) : false;
                                        if ($payload === false) {
                                            throw new ValidationException('Invalid event payload encoding.', 'invalid_response');
                                        }
                                        $webhook = Webhooks::parseVerifiedEvent($payload);
                                    } catch (ValidationException) {
                                        throw new ServerException('Invalid streamed webhook payload.', 'invalid_response', metadata: $metadata);
                                    }
                                }
                                /** @var StreamedEvent $event */ $event = $frame['event'];
                                yield $index++ => ['event' => $event, 'webhook' => $webhook, 'cursor' => $frame['cursor'], 'streamId' => $frame['streamId'], 'sequence' => $frame['sequence']];
                            } elseif ($kind === 'gap' && ($frame['reason'] ?? '') === 'retention_exceeded') {
                                if ($settings->onGap !== null) {
                                    ($settings->onGap)(['reason' => 'retention_exceeded','missedEvents' => (int)($frame['missedEvents'] ?? 0),'requestedCursor' => is_string($frame['requestedCursor'] ?? null) ? $frame['requestedCursor'] : null]);
                                }
                            } elseif ($kind === 'revoked') {
                                throw new AuthorizationException('Event stream revoked.', 'stream_revoked', metadata: $metadata);
                            } elseif (in_array($kind, ['expiry', 'dropped', 'gap'], true)) {
                                if ($kind === 'expiry') {
                                    $attempt = 0;
                                }
                                $failure = new ConnectionException('Event stream connection ended.', 'stream_'.(string)$kind, metadata:$metadata);
                                break 2;
                            }
                        }
                    }
                } finally {
                    $body->close();
                    $this->activeBody = null;
                }
            } catch (CancelledException $error) {
                if ($options->cancellation?->isCancelled() || $this->isClosed()) {
                    return;
                }
                throw $error;
            } catch (AuthenticationException|AuthorizationException|NotFoundException|ValidationException $error) {
                throw $error;
            } catch (PolymorfaException $error) {
                if ($error->status === 410 || $error->errorCode === 'stream_revoked') {
                    throw $error;
                }
                $failure = $error;
                $retry = trim($error->metadata?->headers['retry-after'] ?? '');
                if ($retry !== '') {
                    $date = strtotime($retry);
                    $serverDelay = ctype_digit($retry) ? (float)$retry : ($date === false ? null : max(0.0, $date - time()));
                }
            }
            if ($this->isClosed() || $options->cancellation?->isCancelled()) {
                return;
            }
            $ceiling = min($settings->maxDelay, $settings->initialDelay * 2 ** min($attempt, 30));
            $delay = $serverDelay === null ? $ceiling * (0.5 + random_int(0, 10000) / 20000) : min($settings->maxDelay, $serverDelay);
            ++$attempt;
            if ($settings->onReconnect !== null) {
                ($settings->onReconnect)($failure, $delay);
            }
            $until = microtime(true) + $delay;
            while (!$this->isClosed() && !$options->cancellation?->isCancelled() && microtime(true) < $until) {
                usleep((int)(min(0.05, max(0.0, $until - microtime(true))) * 1000000));
            }
        }
    }
    /** @phpstan-impure */
    private static function ended(\Psr\Http\Message\StreamInterface $body): bool
    {
        return $body->eof();
    }
}
