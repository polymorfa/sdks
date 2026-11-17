<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,SecurityModels};

/** @phpstan-import-type ConnectionBan from SecurityModels */
final class ConnectionBans extends Resource
{
    /** @return ApiResponse<array{data:list<ConnectionBan>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<ConnectionBan>}> */
        return $this->request('GET', '/platform/bans', options:$options);
    }
    /** @return ApiResponse<array{data:list<ConnectionBan>}> */
    public function listActive(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<ConnectionBan>}> */
        return $this->request('GET', '/platform/bans/active', options:$options);
    }
}
