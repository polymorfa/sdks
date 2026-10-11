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
 * @return ApiResponse<array<string,mixed>|null> */
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
        return $this->transport->request($method, $path, $query, $body, $options);
    }
}
