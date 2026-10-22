<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,FunctionModels,RequestOptions};

/**
 * @phpstan-import-type Definition from FunctionModels
 * @phpstan-import-type ListParams from FunctionModels
 * @phpstan-import-type Deployment from FunctionModels
 * @phpstan-import-type DeploymentSummary from FunctionModels
 * @phpstan-import-type CreateDeployment from FunctionModels
 */
final class FunctionDeployments extends FunctionResource
{
    /** @param ListParams $params
     * @return ApiResponse<array{items:list<DeploymentSummary>,nextCursor:?string}> */
    public function list(string $functionId, array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{items:list<DeploymentSummary>,nextCursor:?string}> */return $this->functionRequest('GET', '/'.self::identifier($functionId).'/deployments', $params, $options);
    }
    /** @param CreateDeployment $input
     * @return ApiResponse<Deployment> */
    public function create(string $functionId, array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::identifier($input['deploymentId']);/** @var ApiResponse<Deployment> */
        return $this->functionRequest('POST', '/'.self::identifier($functionId).'/deployments', $input, $options);
    }
    /** @return ApiResponse<Deployment> */
    public function retrieve(string $functionId, string $deploymentId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<Deployment> */return $this->functionRequest('GET', '/'.self::identifier($functionId).'/deployments/'.self::identifier($deploymentId), options:$options);
    }
    /** @param array{deploymentId:string,expectedRevision:int} $input
     * @return ApiResponse<Definition> */
    public function promote(string $functionId, array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::identifier($input['deploymentId']);
        self::revision($input['expectedRevision']);/** @var ApiResponse<Definition> */
        return $this->functionRequest('PUT', '/'.self::identifier($functionId).'/promotion', $input, $options);
    }
}
