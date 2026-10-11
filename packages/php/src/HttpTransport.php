<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\ConnectException;
use GuzzleHttp\Exception\RequestException;
use GuzzleHttp\Exception\TransferException;
use Psr\Http\Message\ResponseInterface;

final class HttpTransport
{
    public const SDK_VERSION = '0.1.0-dev.0';
    public const API_VERSION = '2026-09-22';
    private readonly ClientInterface $http;
    private readonly string $baseUrl;

    public function __construct(
        private readonly ?Credential $credential,
        string $baseUrl = 'https://api.polymorfa.com',
        private readonly string $apiVersion = self::API_VERSION,
        private readonly float $timeout = 30,
        private readonly int $maxNetworkRetries = 2,
        ?string $proxy = null,
        ?ClientInterface $http = null,
    ) {
        $url = parse_url($baseUrl);
        if ($url === false || !isset($url['host'], $url['scheme'])
            || !in_array($url['scheme'], ['http', 'https'], true)
            || isset($url['user']) || isset($url['pass']) || isset($url['query']) || isset($url['fragment'])
            || (isset($url['path']) && !in_array($url['path'], ['', '/'], true))
            || ($credential !== null && $url['scheme'] === 'http' && !in_array($url['host'], ['localhost', '127.0.0.1', '[::1]'], true))) {
            throw new ConfigurationException('baseUrl');
        }
        new RequestOptions($timeout, $maxNetworkRetries, $apiVersion);
        $this->baseUrl = rtrim($baseUrl, '/');
        $this->http = $http ?? new Client(['proxy' => $proxy ?? '', 'allow_redirects' => false]);
    }

    public function credentialKind(): string
    {
        return $this->credential === null ? 'none' : $this->credential->kind;
    }

    /**
 * @param array<string,mixed> $query
     *
 *
 * @return array{ResponseInterface,ResponseMetadata}
     */
    public function openStream(
        string $method,
        string $path,
        array $query = [],
        mixed $body = null,
        ?RequestOptions $options = null,
        string $accept = 'application/json'
    ): array {
        $options ??= new RequestOptions();
        if (!str_starts_with($path, '/') || str_starts_with($path, '//') || strpbrk($path, "\\#?") !== false
            || in_array('..', explode('/', rawurldecode($path)), true) || str_contains(rawurldecode($path), '\\')) {
            throw new ConfigurationException('path');
        }
        $headers = $options->headers;
        foreach ($headers as $name => $value) {
            if (in_array(strtolower($name), ['authorization', 'host', 'cookie', 'user-agent', 'polymorfa-version', 'idempotency-key', 'content-length'], true)) {
                throw new ConfigurationException('headers');
            }
        }
        if ($this->credential !== null) {
            $headers['Authorization'] = $this->credential->authorization();
        }
        $headers['Polymorfa-Version'] = $options->apiVersion ?? $this->apiVersion;
        $headers['User-Agent'] = 'polymorfa-php/' . self::SDK_VERSION . ' PHP/' . PHP_VERSION;
        $headers['Accept'] ??= $accept;
        if ($options->idempotencyKey !== null) {
            $headers['Idempotency-Key'] = $options->idempotencyKey;
        }
        $queryString = self::encodeQuery($query);
        $url = $this->baseUrl . $path . ($queryString === '' ? '' : '?' . $queryString);
        $safe = in_array($method, ['GET', 'HEAD', 'OPTIONS'], true) || $options->idempotencyKey !== null;
        $retries = $options->maxNetworkRetries ?? $this->maxNetworkRetries;
        for ($attempt = 1; $attempt <= $retries + 1; ++$attempt) {
            $options->cancellation?->throwIfCancelled();
            $receivedMetadata = null;
            $request = ['on_headers' => static function (ResponseInterface $received) use (&$receivedMetadata, $attempt): void {
                $receivedMetadata = ResponseMetadata::fromResponse($received, $attempt);
            }, 'headers' => $headers, 'http_errors' => false, 'allow_redirects' => false,
                'timeout' => $options->timeout ?? $this->timeout, 'read_timeout' => $options->timeout ?? $this->timeout,
                'stream' => $accept === 'text/event-stream'];
            if ($body !== null) {
                $request['json'] = $body;
            }
            if ($options->cancellation !== null) {
                $request['progress'] = static function () use ($options): void {
                    $options->cancellation->throwIfCancelled();
                };
            }
            try {
                $response = $this->http->request($method, $url, $request);
            } catch (ConnectException $error) {
                $options->cancellation?->throwIfCancelled();
                if ($receivedMetadata !== null && isset($receivedMetadata->headers['x-polymorfa-operation-id'])) {
                    $context = $error->getHandlerContext();
                    $type = ($context['errno'] ?? null) === 28 ? TimeoutException::class : ConnectionException::class;
                    throw new $type('The response body could not be read. Query operation status before retrying.', $type === TimeoutException::class ? 'request_timeout' : 'connection_error', status: $receivedMetadata->status, requestId: $receivedMetadata->requestId, metadata: $receivedMetadata);
                }
                if ($safe && $attempt <= $retries) {
                    self::sleep(self::retryDelay(null, $attempt), $options);
                    continue;
                }
                $context = $error->getHandlerContext();
                if (($context['errno'] ?? null) === 28) {
                    throw new TimeoutException('Request timed out.', 'request_timeout');
                }
                throw new ConnectionException('Could not reach Polymorfa.', 'connection_error');
            } catch (TransferException $error) {
                $options->cancellation?->throwIfCancelled();
                if ($receivedMetadata !== null && isset($receivedMetadata->headers['x-polymorfa-operation-id'])) {
                    $context = $error instanceof RequestException ? $error->getHandlerContext() : [];
                    $type = ($context['errno'] ?? null) === 28 ? TimeoutException::class : ConnectionException::class;
                    throw new $type('The response body could not be read. Query operation status before retrying.', $type === TimeoutException::class ? 'request_timeout' : 'connection_error', status: $receivedMetadata->status, requestId: $receivedMetadata->requestId, metadata: $receivedMetadata);
                }
                if ($safe && $attempt <= $retries) {
                    self::sleep(self::retryDelay(null, $attempt), $options);
                    continue;
                }
                throw new ConnectionException('Could not reach Polymorfa.', 'connection_error');
            }
            $status = $response->getStatusCode();
            $metadata = ResponseMetadata::fromResponse($response, $attempt);
            if ($safe && $attempt <= $retries && !$response->hasHeader('x-polymorfa-operation-id') && $response->getHeaderLine('Idempotent-Replayed') !== 'true'
                && (in_array($status, [408, 409, 429], true) || $status >= 500)) {
                $response->getBody()->close();
                self::sleep(self::retryDelay($response, $attempt), $options);
                continue;
            }
            if ($status >= 400) {
                $this->raiseError($response, $metadata);
            }
            return [$response, $metadata];
        }
        throw new \LogicException('Unreachable retry state.');
    }

    /**
 * @param array<string,mixed> $query
 *
 * @return ApiResponse<array<string,mixed>|null> */
    public function request(
        string $method,
        string $path,
        array $query = [],
        mixed $body = null,
        ?RequestOptions $options = null
    ): ApiResponse {
        [$response, $metadata] = $this->openStream($method, $path, $query, $body, $options);
        try {
            $raw = $response->getBody()->getContents();
            if ($metadata->status === 204 || $raw === '') {
                return new ApiResponse(null, $metadata);
            }
            if (!str_contains(strtolower($response->getHeaderLine('Content-Type')), 'json')) {
                throw new ServerException('Unexpected response content type.', 'invalid_response', metadata: $metadata);
            }
            try {
                $value = json_decode($raw, true, 512, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                throw new ServerException('Invalid JSON response.', 'invalid_response', metadata: $metadata);
            }
            if (!is_array($value) || !str_starts_with(ltrim($raw), '{')) {
                throw new ServerException('Expected an object response.', 'invalid_response', metadata: $metadata);
            }
            /** @var array<string,mixed> $value */
            return new ApiResponse($value, $metadata);
        } finally {
            $response->getBody()->close();
        }
    }

    /**
 *
 * @return ApiResponse<string> */
    public function binary(string $path, ?RequestOptions $options = null): ApiResponse
    {
        [$response, $metadata] = $this->openStream('GET', $path, options: $options, accept: 'application/octet-stream');
        try {
            if ($response->getStatusCode() >= 300 && $response->getStatusCode() < 400) {
                $location = $response->getHeaderLine('Location');
                $response->getBody()->close();
                $url = parse_url($location);
                if ($url === false || ($url['scheme'] ?? '') !== 'https' || !isset($url['host']) || isset($url['user'])) {
                    throw new ServerException('Invalid media redirect.', 'invalid_response', metadata: $metadata);
                }
                try {
                    // Storage receives the signed capability URL alone, never API headers.
                    $storage = $this->http->send(new \GuzzleHttp\Psr7\Request('GET', $location), ['http_errors' => false, 'allow_redirects' => false,
                        'headers' => null, 'auth' => null, 'timeout' => $options->timeout ?? $this->timeout]);
                    try {
                        if ($storage->getStatusCode() >= 300) {
                            throw new ServerException('Storage download failed.', status: $storage->getStatusCode());
                        }
                        return new ApiResponse($storage->getBody()->getContents(), $metadata);
                    } finally {
                        $storage->getBody()->close();
                    }
                } catch (TransferException) {
                    throw new ConnectionException('Storage download failed.', 'connection_error');
                }
            }
            return new ApiResponse($response->getBody()->getContents(), $metadata);
        } finally {
            $response->getBody()->close();
        }
    }

    private function raiseError(ResponseInterface $response, ResponseMetadata $metadata): never
    {
        $error = [];
        try {
            if (str_contains(strtolower($response->getHeaderLine('Content-Type')), 'json')) {
                $value = json_decode($response->getBody()->getContents(), true);
                if (is_array($value) && isset($value['error']) && is_array($value['error'])) {
                    $error = $value['error'];
                }
            }
        } finally {
            $response->getBody()->close();
        }
        $type = match ($metadata->status) {
            400, 413, 422 => ValidationException::class, 401 => AuthenticationException::class,
            402 => PaymentRequiredException::class, 403 => AuthorizationException::class,
            404 => NotFoundException::class, 409 => ConflictException::class,
            429 => RateLimitException::class, default => $metadata->status >= 500 ? ServerException::class : PolymorfaException::class,
        };
        $text = static fn (string $name): ?string => isset($error[$name]) && is_string($error[$name]) ? $error[$name] : null;
        throw new $type(
            $text('message') ?? "Polymorfa request failed (HTTP {$metadata->status}).",
            $text('code'),
            $metadata->status,
            $text('request_id') ?? $metadata->requestId,
            $metadata,
            $text('request_log_url'),
            $text('docs'),
            $metadata->headers['polymorfa-ratelimit-reason'] ?? null,
            $error['details'] ?? null
        );
    }

    /**
 * @param array<string,mixed> $query */
    private static function encodeQuery(array $query): string
    {
        $pairs = [];
        foreach ($query as $name => $value) {
            if ($value === null) {
                continue;
            }
            foreach (is_array($value) ? $value : [$value] as $item) {
                if (!is_scalar($item)) {
                    throw new ConfigurationException('query');
                }
                $pairs[] = rawurlencode($name) . '=' . rawurlencode(is_bool($item) ? ($item ? 'true' : 'false') : (string) $item);
            }
        }
        return implode('&', $pairs);
    }

    public static function retryDelay(?ResponseInterface $response, int $attempt): float
    {
        $value = $response?->getHeaderLine('Retry-After') ?? '';
        if ($value !== '') {
            if (is_numeric($value) && (float) $value >= 0) {
                return min(60, (float) $value);
            }
            $date = strtotime($value);
            if ($date !== false) {
                return min(60, max(0, $date - time()));
            }
        }
        return min(0.5 * 2 ** min($attempt - 1, 20), 5) * (0.5 + random_int(0, 10000) / 20000);
    }

    public static function sleep(float $seconds, RequestOptions $options): void
    {
        $deadline = microtime(true) + $seconds;
        do {
            $options->cancellation?->throwIfCancelled();
            $remaining = $deadline - microtime(true);
            if ($remaining <= 0) {
                return;
            }
            usleep((int) (min($remaining, 0.05) * 1000000));
        } while (true);
    }
}
