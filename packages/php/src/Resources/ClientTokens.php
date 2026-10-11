<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, ClientTokenModels, Models, ConfigurationException, RequestOptions};

/**
 * @phpstan-import-type MintSession from ClientTokenModels
 * @phpstan-import-type MintCustomer from ClientTokenModels
 * @phpstan-import-type TokenValue from ClientTokenModels
 * @phpstan-import-type ClientRules from ClientTokenModels
 * @phpstan-import-type SetRules from ClientTokenModels
 * @phpstan-import-type Success from Models
 */
final class ClientTokens extends Resource
{
    /** @param MintSession|MintCustomer $body
     * @return ApiResponse<array{success:bool,data:TokenValue}> */
    public function mint(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        $session = self::hasTarget($body['session'] ?? null);
        $customer = self::hasTarget($body['customer'] ?? null);
        if ($session === $customer) {
            throw new ConfigurationException($session ? 'customer' : 'session');
        }
        if (array_key_exists('allow', $body) && !$customer) {
            throw new ConfigurationException('allow');
        }
        /** @var ApiResponse<array{success:bool,data:TokenValue}> */
        return $this->request('POST', '/platform/client-tokens', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ClientRules}> */
    public function retrieveRules(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:ClientRules}> */
        return $this->request('GET', self::path($session), options:$options);
    }
    /** @param SetRules $body
     * @return ApiResponse<Success> */
    public function updateRules(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<Success> */
        return $this->request('PUT', self::path($session), $body, options:$options);
    }
    /** @return ApiResponse<Success> */
    public function deleteRules(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', self::path($session), options:$options);
    }
    private static function hasTarget(mixed $target): bool
    {
        return is_string($target) && $target !== '';
    }
    private static function path(string $session): string
    {
        return '/platform/sessions/'.self::segment($session).'/client-rules';
    }
}
