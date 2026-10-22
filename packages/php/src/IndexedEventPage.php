<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type EventRecord from DeveloperModels
 * @implements \IteratorAggregate<int,EventRecord>
 */
final class IndexedEventPage implements \IteratorAggregate
{
    /** @var list<EventRecord> */ public readonly array $items;
    public readonly bool $hasMore;
    public readonly ?string $nextOffset;
    public readonly string $highWatermark;
    public readonly ResponseMetadata $metadata;
    /** @param array<string,mixed> $query
 * @param ApiResponse<array<string,mixed>|null> $response */
    public function __construct(private readonly HttpTransport $transport, private readonly string $path, private readonly array $query, private readonly ?RequestOptions $options, ApiResponse $response)
    {
        $this->metadata = $response->metadata;
        $body = $response->data;
        $page = $body['page'] ?? null;
        if (!is_array($body) || !is_array($body['data'] ?? null) || !array_is_list($body['data']) || !is_array($page) || !is_bool($page['hasMore'] ?? null) || !self::offset($page['highWatermark'] ?? null)) {
            throw new ServerException('Invalid indexed event page.', 'invalid_response', metadata:$response->metadata);
        }
        $next = $page['nextOffset'] ?? null;
        $after = $query['afterOffset'] ?? '0';
        if (!is_string($after) || ($page['hasMore'] && (!self::offset($next) || self::compare($next, $after) <= 0 || self::compare($next, $page['highWatermark']) > 0)) || (!$page['hasMore'] && $next !== null)) {
            throw new ServerException('Event offset did not advance.', 'invalid_response', metadata:$response->metadata);
        }
        /** @var list<EventRecord> $items */ $items = $body['data'];
        $this->items = $items;
        $this->hasMore = $page['hasMore'];
        $this->nextOffset = $next;
        $this->highWatermark = $page['highWatermark'];
    }
    public static function offset(mixed $value): bool
    {
        return is_string($value) && preg_match('/^(0|[1-9][0-9]*)$/D', $value) === 1 && self::compare($value, '9223372036854775807') <= 0;
    }
    private static function compare(string $a, string $b): int
    {
        return strlen($a) <=> strlen($b) ?: strcmp($a, $b);
    }
    public function nextPage(): ?self
    {
        if (!$this->hasMore) {
            return null;
        }
        $query = array_replace($this->query, ['afterOffset' => $this->nextOffset]);
        return new self($this->transport, $this->path, $query, $this->options, $this->transport->request('GET', $this->path, $query, options:$this->options));
    }
    /**
 * @return \Traversable<int,EventRecord> */
    public function getIterator(): \Traversable
    {
        $current = $this;
        $index = 0;
        while ($current !== null) {
            foreach ($current->items as $item) {
                yield $index++ => $item;
            } $current = $current->nextPage();
        }
    }
}
