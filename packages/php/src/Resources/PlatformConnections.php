<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, BanSafeModels, ConnectionModels, PlatformConnectionModels, RequestOptions, ValidationException};

/**
 * @phpstan-import-type Connection from ConnectionModels
 * @phpstan-import-type PlatformConnection from ConnectionModels
 * @phpstan-import-type ConfigurationPatch from ConnectionModels
 * @phpstan-import-type ConnectionContext from PlatformConnectionModels
 * @phpstan-import-type BatchRequest from PlatformConnectionModels
 * @phpstan-import-type TierQuoteRequest from PlatformConnectionModels
 * @phpstan-import-type TierChange from PlatformConnectionModels
 * @phpstan-import-type Capabilities from PlatformConnectionModels
 * @phpstan-import-type ConnectionSafeMode from BanSafeModels
 * @phpstan-import-type UpdateConnectionSafeMode from BanSafeModels
 */
final class PlatformConnections extends Resource
{
    /** @return ApiResponse<array{data:ConnectionSafeMode}> */
    public function getSafeMode(string $connectionId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ConnectionSafeMode}> */
        return $this->request('GET', self::path($connectionId).'/safe-mode', options:$options);
    }
    /** @param UpdateConnectionSafeMode $body
     * @return ApiResponse<array{data:ConnectionSafeMode}> */
    public function updateSafeMode(string $connectionId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:ConnectionSafeMode}> */
        return $this->request('PUT', self::path($connectionId).'/safe-mode', $body, options:$options);
    }

    /** @param array{projectId?:string} $params
     * @return ApiResponse<array{data:list<PlatformConnection>}> */
    public function list(array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<PlatformConnection>}> */
        return $this->request('GET', '/platform/connections', query:$params, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:Connection}> */
    public function retrieve(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Connection}> */
        return \Polymorfa\ExistingContract::request($this->transport, 'GET', self::path($connection), options:$options, model:'connection', messaging:true);
    }
    /** @param array{configuration:ConfigurationPatch,revision:int} $body
     * @return ApiResponse<array{success:bool,data:Connection}> */
    public function update(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $options = \Polymorfa\ExistingContract::options($options, \Polymorfa\ConnectionDeliveryValidation::configuration($body));
        /** @var ApiResponse<array{success:bool,data:Connection}> */
        return \Polymorfa\ExistingContract::request($this->transport, 'PUT', self::path($connection), $body, options:$options, model:'connection', messaging:true);
    }
    /** @param ConnectionContext $body
     * @return ApiResponse<array{data:array{starting:true,connectionId:string}}> */
    public function start(string $connection, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{starting:true,connectionId:string}}> */
        return $this->request('POST', self::path($connection).'/start', (object)$body, options:$options);
    }
    /** @param ConnectionContext $body
     * @return ApiResponse<array{data:array{stopping:true,connectionId:string}}> */
    public function stop(string $connection, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{stopping:true,connectionId:string}}> */
        return $this->request('POST', self::path($connection).'/stop', (object)$body, options:$options);
    }
    /** @param BatchRequest $body
     * @return ApiResponse<array{data:array{stopping:int}}> */
    public function stopMany(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{stopping:int}}> */
        return $this->request('POST', '/platform/connections/stop', $body, options:$options);
    }
    /** @return ApiResponse<array{data:array{removed:true,connectionId:string}}> */
    public function delete(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{removed:true,connectionId:string}}> */
        return $this->request('DELETE', self::path($connection), options:$options);
    }
    /** @param BatchRequest $body
     * @return ApiResponse<array{data:array{removed:int}}> */
    public function deleteMany(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{removed:int}}> */
        return $this->request('POST', '/platform/connections/delete', $body, options:$options);
    }
    /** @param TierQuoteRequest $body
     * @return ApiResponse<array{data:TierChange}> */
    public function quoteTierChange(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        self::validateQuote($body);
        /** @var ApiResponse<array{data:TierChange}> */
        return $this->request('POST', self::path($connection).'/tier-quotes', $body, options:$options);
    }
    /** @return ApiResponse<array{data:TierChange}> */
    public function retrieveTierChange(string $connection, string $quoteId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:TierChange}> */
        return $this->request('GET', self::path($connection).'/tier-quotes/'.self::segment($quoteId), options:$options);
    }
    /** @param array{projectId?:string,quoteId:string} $body
     * @return ApiResponse<array{data:TierChange}> */
    public function setTierOverride(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        self::validateConfirmation($body);
        /** @var ApiResponse<array{data:TierChange}> */
        return $this->request('PATCH', self::path($connection), $body, options:$options);
    }
    /** @return ApiResponse<array{data:Capabilities}> */
    public function getCapabilities(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:Capabilities}> */
        return $this->request('GET', self::path($connection).'/capabilities', options:$options);
    }
    /** @param array<string,mixed> $body */
    private static function validateQuote(array $body): void
    {
        if (array_key_exists('hybridResolution', $body) && array_key_exists('hybridMerge', $body)) {
            throw new ValidationException('Send hybridResolution or hybridMerge, not both.');
        }
    }
    /** @param array<string,mixed> $body */
    private static function validateConfirmation(array $body): void
    {
        if (!isset($body['quoteId']) || !is_string($body['quoteId']) || trim($body['quoteId']) === '') {
            throw new ValidationException('Review a tier quote and supply quoteId.');
        }
    }
    private static function path(string $connectionId): string
    {
        return '/platform/connections/'.self::segment($connectionId);
    }
}
