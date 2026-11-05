<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\{ClientInterface,Promise\PromiseInterface};
use Psr\Http\Message\{RequestInterface,ResponseInterface};

/** Per-operation deadline on a borrowed CDN client, without changing its configuration. */
final class S3DeadlineHttpClient implements ClientInterface
{
    /** @param \Closure():float $remaining */
    public function __construct(private readonly ClientInterface $client, private readonly \Closure $remaining)
    {
    }
    /** @param array<string,mixed> $options
     * @return array<string,mixed> */
    private function options(array $options): array
    {
        $seconds = ($this->remaining)();
        $options['timeout'] = min((float)($options['timeout'] ?? $seconds), $seconds);
        $options['read_timeout'] = min((float)($options['read_timeout'] ?? $seconds), $seconds);
        $check = $this->remaining;
        $options['progress'] = static function () use ($check): void {
            $check();
        };
        return $options;
    }
    /** @param array<string,mixed> $options */ public function send(RequestInterface $request, array $options = []): ResponseInterface
    {
        $response = $this->client->send($request, $this->options($options));
        try {
            ($this->remaining)();
            return $response;
        } catch (\Throwable $error) {
            $response->getBody()->close();
            throw $error;
        }
    }
    /** @param array<string,mixed> $options */ public function sendAsync(RequestInterface $request, array $options = []): PromiseInterface
    {
        return $this->client->sendAsync($request, $this->options($options))->then(function (ResponseInterface $response): ResponseInterface {
            try {
                ($this->remaining)();
                return $response;
            } catch (\Throwable $error) {
                $response->getBody()->close();
                throw $error;
            }
        });
    }
    /** @param array<string,mixed> $options */ public function request(string $method, $uri = '', array $options = []): ResponseInterface
    {
        return $this->client->request($method, $uri, $this->options($options));
    }
    /** @param array<string,mixed> $options */ public function requestAsync(string $method, $uri = '', array $options = []): PromiseInterface
    {
        return $this->client->requestAsync($method, $uri, $this->options($options));
    }
    /** @return array{redacted:true} */ public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    public function getConfig(?string $option = null): mixed
    {
        return $this->client->getConfig($option);
    }
}
