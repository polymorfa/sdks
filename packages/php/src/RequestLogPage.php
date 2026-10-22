<?php

declare(strict_types=1);

namespace Polymorfa;

/** @phpstan-import-type Log from RequestLogModels */
final readonly class RequestLogPage
{
    /** @var list<Log> */ public array $items;
    public bool $hasMore;
    public ?string $nextCursor;
    public string $followCursor;
    public ResponseMetadata $metadata;
    /** @param ApiResponse<array<string,mixed>|null> $response */
    public function __construct(ApiResponse $response)
    {
        $body = $response->data;
        $page = $body['page'] ?? null;
        if (!is_array($body) || !is_array($body['data'] ?? null) || !array_is_list($body['data']) || !is_array($page) || !is_bool($page['hasMore'] ?? null) || !is_string($page['followCursor'] ?? null) || !array_key_exists('nextCursor', $page) || ($page['nextCursor'] !== null && !is_string($page['nextCursor']))) {
            throw new ServerException('The API returned an invalid request log page.', 'invalid_response', metadata:$response->metadata, details:$body);
        }
        /** @var list<Log> $items */ $items = $body['data'];
        $this->items = $items;
        $this->hasMore = $page['hasMore'];
        $this->nextCursor = $page['nextCursor'];
        $this->followCursor = $page['followCursor'];
        $this->metadata = $response->metadata;
    }
}
