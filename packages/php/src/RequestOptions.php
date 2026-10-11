<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class RequestOptions
{
    /**
 * @param array<string,string> $headers */
    public function __construct(
        public ?float $timeout = null,
        public ?int $maxNetworkRetries = null,
        public ?string $apiVersion = null,
        public ?string $idempotencyKey = null,
        public array $headers = [],
        public ?CancellationToken $cancellation = null,
    ) {
        if ($timeout !== null && ($timeout <= 0 || !is_finite($timeout))) {
            throw new ConfigurationException('timeout');
        }
        if ($maxNetworkRetries !== null && $maxNetworkRetries < 0) {
            throw new ConfigurationException('maxNetworkRetries');
        }
        if ($apiVersion !== null && !preg_match('/^\d{4}-\d{2}-\d{2}$/D', $apiVersion)) {
            throw new ConfigurationException('apiVersion');
        }
        if ($idempotencyKey !== null && ($idempotencyKey === '' || strpbrk($idempotencyKey, "\r\n") !== false)) {
            throw new ConfigurationException('idempotencyKey');
        }
    }

    public function withIdempotencyKey(): self
    {
        return $this->idempotencyKey !== null ? $this : new self(
            $this->timeout,
            $this->maxNetworkRetries,
            $this->apiVersion,
            bin2hex(random_bytes(16)),
            $this->headers,
            $this->cancellation,
        );
    }

    public function withoutRetries(): self
    {
        return new self($this->timeout, 0, $this->apiVersion, $this->idempotencyKey, $this->headers, $this->cancellation);
    }
}
