<?php

declare(strict_types=1);

namespace Polymorfa;

use Psr\Http\Message\ResponseInterface;

final readonly class ResponseMetadata
{
    /**
 * @param array<string,string> $headers */
    public function __construct(
        public int $status,
        public int $attempts,
        public array $headers,
        public ?string $requestId,
        public ?string $apiVersion,
    ) {
    }

    public static function fromResponse(ResponseInterface $response, int $attempts): self
    {
        $headers = [];
        foreach ($response->getHeaders() as $name => $values) {
            $name = strtolower($name);
            if (in_array($name, ['content-type', 'x-polymorfa-transport', 'x-polymorfa-routing-reason',
                'x-polymorfa-operation-id', 'x-request-id', 'polymorfa-version', 'retry-after',
                'polymorfa-data-region', 'x-ratelimit-limit', 'x-ratelimit-remaining', 'x-ratelimit-reset',
                'polymorfa-ratelimit-reason', 'polymorfa-next-cursor'], true)) {
                $headers[$name] = implode(', ', $values);
            }
        }
        return new self(
            $response->getStatusCode(),
            $attempts,
            $headers,
            $headers['x-request-id'] ?? null,
            $headers['polymorfa-version'] ?? null
        );
    }
}
