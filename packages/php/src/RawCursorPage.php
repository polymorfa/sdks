<?php

declare(strict_types=1);

namespace Polymorfa;

/** @template T
 * @implements \IteratorAggregate<int,T> */
final class RawCursorPage implements \IteratorAggregate
{
    /** @var list<T> */ public readonly array $items;
    public readonly ?string $nextCursor;
    public readonly bool $hasMore;
    /** @var \Closure(string):self<T> */ private readonly \Closure $loadNext;

    /** @param array{items:list<T>,nextCursor?:?string} $decoded
     * @param ApiResponse<mixed> $response
     * @param \Closure(string):self<T> $loadNext */
    public function __construct(array $decoded, public readonly ApiResponse $response, \Closure $loadNext)
    {
        self::validate($decoded, $response->metadata);
        $cursor = $decoded['nextCursor'] ?? null;
        $this->items = $decoded['items'];
        $this->nextCursor = $cursor === '' ? null : $cursor;
        $this->hasMore = $this->nextCursor !== null;
        $this->loadNext = $loadNext;
    }

    private static function validate(mixed $decoded, ResponseMetadata $metadata): void
    {
        if (!is_array($decoded) || !isset($decoded['items']) || !is_array($decoded['items']) || !array_is_list($decoded['items'])) {
            throw new ServerException('A page decoder must return a list of items.', 'invalid_response', metadata:$metadata);
        }
        $cursor = $decoded['nextCursor'] ?? null;
        if ($cursor !== null && !is_string($cursor)) {
            throw new ServerException('A page decoder must return a string or null cursor.', 'invalid_response', metadata:$metadata);
        }
    }

    /** @return self<T>|null */
    public function nextPage(): ?self
    {
        return $this->nextCursor === null ? null : ($this->loadNext)($this->nextCursor);
    }

    /** @return \Traversable<int,T> */
    public function getIterator(): \Traversable
    {
        $page = $this;
        $seen = [];
        $index = 0;
        while ($page !== null) {
            if ($page->nextCursor !== null && isset($seen[$page->nextCursor])) {
                throw new ServerException('Pagination cursor repeated.', 'invalid_response', metadata:$page->response->metadata);
            }
            foreach ($page->items as $item) {
                yield $index++ => $item;
            }
            if ($page->nextCursor !== null) {
                $seen[$page->nextCursor] = true;
            }
            $page = $page->nextPage();
        }
    }
}
