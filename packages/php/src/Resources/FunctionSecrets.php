<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,FunctionModels,RequestOptions};

/**
 * @phpstan-import-type ListParams from FunctionModels
 * @phpstan-import-type SecretVersion from FunctionModels
 */
final class FunctionSecrets extends FunctionResource
{
    /** @param ListParams $params
     * @return ApiResponse<array{items:list<SecretVersion>,nextCursor:?string}> */
    public function list(string $functionId, array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{items:list<SecretVersion>,nextCursor:?string}> */return $this->functionRequest('GET', '/'.self::identifier($functionId).'/secrets', $params, $options);
    }
    /** @param array{name:string,value:string} $input
     * @return ApiResponse<SecretVersion> */
    public function create(string $functionId, #[\SensitiveParameter] array $input, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<SecretVersion> */return $this->functionRequest('POST', '/'.self::identifier($functionId).'/secrets', $input, $options);
    }
    /** @return ApiResponse<array{ok:true}> */
    public function revoke(string $functionId, string $versionId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{ok:true}> */return $this->functionRequest('DELETE', '/'.self::identifier($functionId).'/secrets/'.self::identifier($versionId), options:$options);
    }
}
