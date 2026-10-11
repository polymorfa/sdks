<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,SecurityModels};

/**
 * @phpstan-import-type OptOutSettings from SecurityModels
 * @phpstan-import-type UpdateOptOutSettings from SecurityModels
 */
final class OptOuts extends Resource
{
    /** The merged TS contract leaves this payload open.
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array<string,mixed>}> */
        return $this->request('GET', '/platform/optouts', options:$options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function create(?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array<string,mixed>}> */
        return $this->request('POST', '/platform/optouts', $body === null ? null : (object)$body, options:$options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function createBatch(?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array<string,mixed>}> */
        return $this->request('POST', '/platform/optouts/batch', $body === null ? null : (object)$body, options:$options);
    }
    /** @return ApiResponse<array{data:OptOutSettings}> */
    public function getSettings(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:OptOutSettings}> */
        return $this->request('GET', '/platform/optouts/settings', options:$options);
    }
    /** @param UpdateOptOutSettings $body
     * @return ApiResponse<array{data:OptOutSettings}> */
    public function updateSettings(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:OptOutSettings}> */
        return $this->request('PUT', '/platform/optouts/settings', $body, options:$options);
    }
    /** @return ApiResponse<array{data:array<string,mixed>}> */
    public function delete(string $phone, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array<string,mixed>}> */
        return $this->request('DELETE', '/platform/optouts/'.self::segment($phone), options:$options);
    }
}
