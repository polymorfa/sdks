<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, BanSafeModels, RequestOptions};

/**
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
    private static function path(string $sessionId): string
    {
        return '/platform/sessions/'.self::segment($sessionId);
    }
}
