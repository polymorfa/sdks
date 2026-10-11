<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, BanSafeModels, SessionModels, PlatformSessionModels, RequestOptions, ValidationException};

/**
 * @phpstan-import-type Session from SessionModels
 * @phpstan-import-type PlatformSession from SessionModels
 * @phpstan-import-type ConfigurationPatch from SessionModels
 * @phpstan-import-type SessionContext from PlatformSessionModels
 * @phpstan-import-type BatchRequest from PlatformSessionModels
 * @phpstan-import-type TierQuoteRequest from PlatformSessionModels
 * @phpstan-import-type TierChange from PlatformSessionModels
 * @phpstan-import-type Capabilities from PlatformSessionModels
 * @phpstan-import-type SessionSafeMode from BanSafeModels
 * @phpstan-import-type UpdateSessionSafeMode from BanSafeModels
 */
final class PlatformSessions extends Resource
{
    /** @return ApiResponse<array{data:SessionSafeMode}> */
    public function getSafeMode(string $sessionId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:SessionSafeMode}> */
        return $this->request('GET', self::path($sessionId).'/safe-mode', options:$options);
    }
    /** @param UpdateSessionSafeMode $body
     * @return ApiResponse<array{data:SessionSafeMode}> */
    public function updateSafeMode(string $sessionId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:SessionSafeMode}> */
        return $this->request('PUT', self::path($sessionId).'/safe-mode', $body, options:$options);
    }

    /** @param array{projectId?:string} $params
     * @return ApiResponse<array{data:list<PlatformSession>}> */
    public function list(array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<PlatformSession>}> */
        return $this->request('GET', '/platform/sessions', query:$params, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:Session}> */
    public function retrieve(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Session}> */
        return $this->request('GET', self::path($session), options:$options);
    }
    /** @param array{configuration:ConfigurationPatch,revision:int} $body
     * @return ApiResponse<array{success:bool,data:Session}> */
    public function update(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Session}> */
        return $this->request('PUT', self::path($session), $body, options:$options);
    }
    /** @param SessionContext $body
     * @return ApiResponse<array{data:array{starting:true,sessionId:string}}> */
    public function start(string $session, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{starting:true,sessionId:string}}> */
        return $this->request('POST', self::path($session).'/start', (object)$body, options:$options);
    }
    /** @param SessionContext $body
     * @return ApiResponse<array{data:array{stopping:true,sessionId:string}}> */
    public function stop(string $session, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{stopping:true,sessionId:string}}> */
        return $this->request('POST', self::path($session).'/stop', (object)$body, options:$options);
    }
    /** @param BatchRequest $body
     * @return ApiResponse<array{data:array{stopping:int}}> */
    public function stopMany(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{stopping:int}}> */
        return $this->request('POST', '/platform/sessions/stop', $body, options:$options);
    }
    /** @return ApiResponse<array{data:array{removed:true,sessionId:string}}> */
    public function delete(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{removed:true,sessionId:string}}> */
        return $this->request('DELETE', self::path($session), options:$options);
    }
    /** @param BatchRequest $body
     * @return ApiResponse<array{data:array{removed:int}}> */
    public function deleteMany(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{removed:int}}> */
        return $this->request('POST', '/platform/sessions/delete', $body, options:$options);
    }
    /** @param TierQuoteRequest $body
     * @return ApiResponse<array{data:TierChange}> */
    public function quoteTierChange(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        self::validateQuote($body);
        /** @var ApiResponse<array{data:TierChange}> */
        return $this->request('POST', self::path($session).'/tier-quotes', $body, options:$options);
    }
    /** @return ApiResponse<array{data:TierChange}> */
    public function retrieveTierChange(string $session, string $quoteId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:TierChange}> */
        return $this->request('GET', self::path($session).'/tier-quotes/'.self::segment($quoteId), options:$options);
    }
    /** @param array{projectId?:string,quoteId:string} $body
     * @return ApiResponse<array{data:TierChange}> */
    public function setTierOverride(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        self::validateConfirmation($body);
        /** @var ApiResponse<array{data:TierChange}> */
        return $this->request('PATCH', self::path($session), $body, options:$options);
    }
    /** @return ApiResponse<array{data:Capabilities}> */
    public function getCapabilities(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:Capabilities}> */
        return $this->request('GET', self::path($session).'/capabilities', options:$options);
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
    private static function path(string $sessionId): string
    {
        return '/platform/sessions/'.self::segment($sessionId);
    }
}
