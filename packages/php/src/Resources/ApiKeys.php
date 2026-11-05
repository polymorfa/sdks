<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,AccountModels,RequestOptions};

/** @phpstan-import-type ApiKey from AccountModels */
final class ApiKeys extends Resource
{
    /** @return ApiResponse<array{data:list<ApiKey>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:list<ApiKey>}> */
        return $this->request('GET', '/platform/keys', options:$options);
    }
    /** @return ApiResponse<array{data:array{ok:true,keyId:string}}> */
    public function deactivate(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array{ok:true,keyId:string}}> */
        return $this->request('DELETE', '/platform/keys/'.self::segment($id), options:$options);
    }
}
