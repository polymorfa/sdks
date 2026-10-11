<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,SecurityModels};

/** @phpstan-import-type SessionBan from SecurityModels */
final class SessionBans extends Resource
{
    /** @return ApiResponse<array{data:list<SessionBan>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<SessionBan>}> */
        return $this->request('GET', '/platform/bans', options:$options);
    }
    /** @return ApiResponse<array{data:list<SessionBan>}> */
    public function listActive(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<SessionBan>}> */
        return $this->request('GET', '/platform/bans/active', options:$options);
    }
}
