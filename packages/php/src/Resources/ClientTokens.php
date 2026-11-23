<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, ClientTokenModels, Models, ConfigurationException, RequestOptions};

/**
 * @phpstan-import-type MintConnection from ClientTokenModels
 * @phpstan-import-type MintCustomer from ClientTokenModels
 * @phpstan-import-type TokenValue from ClientTokenModels
 * @phpstan-import-type ClientRules from ClientTokenModels
 * @phpstan-import-type SetRules from ClientTokenModels
 * @phpstan-import-type Success from Models
 */
final class ClientTokens extends Resource
{
    /** @param MintConnection|MintCustomer $body
     * @return ApiResponse<array{success:bool,data:TokenValue}> */
    public function mint(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        $connection = self::hasTarget($body['connection'] ?? null);
        $customer = self::hasTarget($body['customer'] ?? null);
        if ($connection === $customer) {
            throw new ConfigurationException($connection ? 'customer' : 'connection');
        }
        /** @var ApiResponse<array{success:bool,data:TokenValue}> */
        return $this->request('POST', '/platform/client-tokens', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ClientRules}> */
    public function retrieveRules(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ClientRules}> */
        return $this->request('GET', self::path($connection), options:$options);
    }
    /** @param SetRules $body
     * @return ApiResponse<Success> */
    public function updateRules(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<Success> */
        return $this->request('PUT', self::path($connection), $body, options:$options);
    }
    /** @return ApiResponse<Success> */
    public function deleteRules(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', self::path($connection), options:$options);
    }
    private static function hasTarget(mixed $target): bool
    {
        return is_string($target) && $target !== '';
    }
    private static function path(string $connection): string
    {
        return '/platform/connections/'.self::segment($connection).'/client-rules';
    }
}
