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
        private readonly ?RequestOptions $options = null
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
        while (!$this->isClosed()) {
            $options->cancellation?->throwIfCancelled();
            $headers = $options->headers + ($this->cursor === null ? [] : ['Last-Event-ID' => $this->cursor]);
            $requestOptions = new RequestOptions($options->timeout, $options->maxNetworkRetries, $options->apiVersion, null, $headers, $options->cancellation);
            $query = ($this->types === [] ? [] : ['types' => implode(',', $this->types)]) + ($this->manualAck ? ['ack' => 'manual'] : []);
            $delay = min(30, HttpTransport::retryDelay(null, $attempt + 2));
            try {
                [$response, $metadata] = $this->transport->openStream('GET', $this->path, $query, options: $requestOptions, accept: 'text/event-stream');
                $this->metadata = $metadata;
                try {
                    if (explode(';', $response->getHeaderLine('Content-Type'))[0] !== 'text/event-stream') {
                        throw new ServerException('Expected an event stream.', 'invalid_response', metadata: $metadata);
                    }
                    $buffer = '';
                    $data = [];
                    while (!$this->isClosed() && !$response->getBody()->eof()) {
                        $options->cancellation?->throwIfCancelled();
                        $buffer .= $response->getBody()->read(4096);
                        while (($end = strpos($buffer, "\n")) !== false) {
                            $line = rtrim(substr($buffer, 0, $end), "\r");
                            $buffer = substr($buffer, $end + 1);
                            if (str_starts_with($line, 'data:')) {
                                $data[] = ltrim(substr($line, 5), ' ');
                            } elseif ($line === '' && $data !== []) {
                                try {
                                    $frame = json_decode(implode("\n", $data), true, 512, JSON_THROW_ON_ERROR);
                                } catch (\JsonException) {
                                    throw new ServerException('Invalid event stream frame.', 'invalid_response');
                                }
                                $data = [];
                                if (!is_array($frame)) {
                                    throw new ServerException('Invalid event stream frame.', 'invalid_response');
                                }
                                $kind = $frame['type'] ?? null;
                                if ($kind === 'checkpoint' && isset($frame['cursor']) && is_string($frame['cursor'])) {
                                    $this->cursor = $frame['cursor'];
                                } elseif ($kind === 'event') {
                                    if (!isset($frame['event'], $frame['cursor'], $frame['sequence'], $frame['streamId']) || !is_array($frame['event']) || !is_string($frame['cursor']) || !is_int($frame['sequence']) || !is_string($frame['streamId'])) {
                                        throw new ServerException('Invalid streamed event.', 'invalid_response');
                                    }
                                    $this->cursor = $frame['cursor'];
                                    $attempt = 0;
                                    $webhook = null;
                                    if (($frame['event']['payload'] ?? null) !== null) {
                                        try {
                                            $encoded = $frame['event']['payload'];
                                            $bytes = is_array($encoded) && is_string($encoded['data'] ?? null) ? base64_decode($encoded['data'], true) : false;
                                            if ($bytes === false) {
                                                throw new ValidationException('Invalid event payload encoding.', 'invalid_response');
                                            }
                                            $webhook = Webhooks::parseVerifiedEvent($bytes);
                                        } catch (ValidationException) {
                                        }
                                    }
                                    /** @var StreamedEvent $event */ $event = $frame['event'];
                                    yield $index++ => ['event' => $event, 'webhook' => $webhook, 'cursor' => $frame['cursor'], 'streamId' => $frame['streamId'], 'sequence' => $frame['sequence']];
                                } elseif ($kind === 'revoked') {
                                    throw new AuthorizationException('Event stream revoked.', 'stream_revoked');
                                } elseif (in_array($kind, ['expiry', 'dropped'], true) || ($kind === 'gap' && ($frame['reason'] ?? '') !== 'retention_exceeded')) {
                                    break 2;
                                }
                            }
                        }
                    }
                } finally {
                    $response->getBody()->close();
                }
            } catch (AuthenticationException|AuthorizationException|NotFoundException|ValidationException $error) {
                throw $error;
            } catch (PolymorfaException $error) {
                if ($error->status === 410) {
                    throw $error;
                }
            }
            if (!$this->isClosed()) {
                ++$attempt;
                HttpTransport::sleep($delay, $options);
            }
        }
    }
}
