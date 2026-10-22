<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class RawClient
{
    public function __construct(private HttpTransport $transport, private ?string $projectId = null)
    {
    }
    /**
 * @param array<string,mixed> $query
 *
 * @return ApiResponse<mixed> */
    public function request(string $method, string $path, array $query = [], mixed $body = null, ?RequestOptions $options = null): ApiResponse
    {
        if ($this->projectId !== null) {
            $decoded = rawurldecode($path);
            if (!str_starts_with($path, '/') || str_starts_with($path, '//') || str_contains($decoded, '\\')
                || in_array('..', explode('/', $decoded), true) || str_starts_with($decoded, '/platform/projects/')) {
                throw new ValidationException('Raw path must be relative to the bound project.');
            }
            $path = '/platform/projects/' . rawurlencode($this->projectId) . $path;
        }
        return $this->transport->requestJson($method, $path, $query, $body, $options);
    }
    /** @template T
     * @param callable(mixed,ResponseMetadata):array{items:list<T>,nextCursor?:?string} $decode
     * @param array<string,mixed> $query
     * @return RawCursorPage<T> */
    public function paginate(string $method, string $path, callable $decode, array $query = [], mixed $body = null, ?RequestOptions $options = null, string $cursorParameter = 'cursor'): RawCursorPage
    {
        if (trim($cursorParameter) === '') {
            throw new ConfigurationException('cursorParameter');
        }
        $response = $this->request($method, $path, $query, $body, $options);
        $decoded = $decode($response->data, $response->metadata);
        $cursor = $decoded['nextCursor'] ?? null;
        if ($cursor !== null && $cursor !== '' && $cursor === ($query[$cursorParameter] ?? null)) {
            throw new ServerException('Pagination cursor did not advance.', 'invalid_response', metadata:$response->metadata);
        }
        return new RawCursorPage($decoded, $response, fn (string $next): RawCursorPage => $this->paginate($method, $path, $decode, array_replace($query, [$cursorParameter => $next]), $body, $options, $cursorParameter));
    }

}
