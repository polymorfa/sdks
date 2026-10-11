<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @template T
 * @implements \IteratorAggregate<int,T> */
final class CursorPage implements \IteratorAggregate
{
    /** @var list<T> */
    public readonly array $items;
    public readonly ?string $nextCursor;
    public readonly bool $hasMore;
    /**
 * @param array<string,mixed> $query
 * @param ApiResponse<array<string,mixed>|null> $response */
    public function __construct(
        private readonly HttpTransport $transport,
        private readonly string $path,
        private readonly array $query,
        private readonly ?RequestOptions $options,
        public readonly ApiResponse $response
    ) {
        $data = $response->data;
        if ($data === null) {
            throw new ServerException("Expected cursor page data.", "invalid_response", metadata: $response->metadata);
        }
        $page = $data['page'] ?? [];
        if (!isset($data['data']) || !is_array($data['data']) || !array_is_list($data['data']) || !is_array($page)) {
            throw new ServerException('Invalid cursor page.', 'invalid_response', metadata: $response->metadata);
        }
        $cursor = $page['nextCursor'] ?? null;
        if ($cursor !== null && !is_string($cursor)) {
            throw new ServerException('Invalid cursor.', 'invalid_response');
        }
        $hasMore = $page['hasMore'] ?? ($cursor !== null && $cursor !== '');
        if (!is_bool($hasMore) || ($hasMore && ($cursor === null || $cursor === '' || $cursor === ($query['cursor'] ?? null)))) {
            throw new ServerException('Cursor did not advance.', 'invalid_response');
        }
        /** @var list<T> $items */ $items = $data['data'];
        $this->items = $items;
        $this->nextCursor = $cursor;
        $this->hasMore = $hasMore;
    }
    /**
 *
 * @return self<T>|null */
    public function nextPage(): ?self
    {
        if (!$this->hasMore) {
            return null;
        }
        $query = array_replace($this->query, ['cursor' => $this->nextCursor]);
        return new self($this->transport, $this->path, $query, $this->options, $this->transport->request('GET', $this->path, $query, options: $this->options));
    }
    /**
 *
 * @return \Traversable<int,T> */
    public function getIterator(): \Traversable
    {
        $current = $this;
        $seen = [];
        $index = 0;
        while ($current !== null) {
            if ($current->hasMore && isset($seen[$current->nextCursor])) {
                throw new ServerException('Repeated cursor.', 'invalid_response');
            }
            foreach ($current->items as $item) {
                yield $index++ => $item;
            }
            if ($current->nextCursor !== null) {
                $seen[$current->nextCursor] = true;
            }
            $current = $current->nextPage();
        }
    }
}
