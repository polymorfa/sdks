<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\CursorPage;
use Polymorfa\HttpTransport;
use Polymorfa\RequestOptions;
use Polymorfa\ServerException;

abstract class PlatformResource extends Resource
{
    public function __construct(HttpTransport $transport, protected readonly string $prefix)
    {
        parent::__construct($transport);
    }
    /**
 * @param array<string,mixed> $query
 *
 * @return ApiResponse<array<string,mixed>> */
    protected function unwrapped(string $method, string $path, mixed $body = null, array $query = [], ?RequestOptions $options = null): ApiResponse
    {
        $response = $this->request($method, $path, $body, $query, $options);
        if (!array_key_exists('data', $response->data) || !is_array($response->data['data'])) {
            throw new ServerException('Invalid response envelope.', 'invalid_response', metadata: $response->metadata);
        }
        /** @var array<string,mixed> $data */ $data = $response->data['data'];
        return new ApiResponse($data, $response->metadata);
    }
    /**
 * @param array<string,mixed> $query
 *
 * @return CursorPage<array<string,mixed>> */
    protected function page(string $path, array $query, ?RequestOptions $options): CursorPage
    {
        return new CursorPage($this->transport, $path, $query, $options, $this->request('GET', $path, query: $query, options: $options));
    }
}
