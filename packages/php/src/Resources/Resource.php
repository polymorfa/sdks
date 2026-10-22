<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\ConfigurationException;
use Polymorfa\HttpTransport;
use Polymorfa\RequestOptions;

abstract class Resource
{
    public function __construct(protected readonly HttpTransport $transport)
    {
    }
    protected function server(): void
    {
        if ($this->transport->credentialKind() === 'client_token') {
            throw new ConfigurationException('credential');
        }
    }
    protected static function segment(string $value): string
    {
        if ($value === '') {
            throw new ConfigurationException('identifier');
        }
        return rawurlencode($value);
    }
    /**
 * @param array<string,mixed> $query
 *
 * @return ApiResponse<array<string,mixed>> */
    protected function request(
        string $method,
        string $path,
        mixed $body = null,
        array $query = [],
        ?RequestOptions $options = null
    ): ApiResponse {
        $response = $this->transport->request($method, $path, $query, $body, $options);
        if ($response->data === null) {
            throw new \Polymorfa\ServerException("Expected an object response.", "invalid_response", metadata: $response->metadata);
        }
        return new ApiResponse($response->data, $response->metadata);
    }
}
