<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,FunctionModels,HttpTransport,RequestOptions};

/**
 * @phpstan-import-type Definition from FunctionModels
 * @phpstan-import-type ListParams from FunctionModels
 * @phpstan-import-type CreateInput from FunctionModels
 * @phpstan-import-type UpdateInput from FunctionModels
 */
final class Functions extends FunctionResource
{
    public readonly FunctionDeployments $deployments;
    public readonly FunctionSecrets $secrets;
    public readonly FunctionInvocations $invocations;
    public function __construct(HttpTransport $transport, string $projectId)
    {
        parent::__construct($transport, $projectId);
        $this->deployments = new FunctionDeployments($transport, $projectId);
        $this->secrets = new FunctionSecrets($transport, $projectId);
        $this->invocations = new FunctionInvocations($transport, $projectId);
    }
    /** @param ListParams $params
     * @return ApiResponse<array{items:list<Definition>,nextCursor:?string}> */
    public function list(array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{items:list<Definition>,nextCursor:?string}> */return $this->functionRequest('GET', '', $params, $options);
    }
    /** @param CreateInput $input
     * @return ApiResponse<Definition> */
    public function create(array $input, ?RequestOptions $options = null): ApiResponse
    {
        if (isset($input['functionId'])) {
            self::identifier($input['functionId']);
        }/** @var ApiResponse<Definition> */return $this->functionRequest('POST', '', $input, $options);
    }
    /** @return ApiResponse<Definition> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<Definition> */return $this->functionRequest('GET', '/'.self::identifier($id), options:$options);
    }
    /** @param UpdateInput $input
     * @return ApiResponse<Definition> */
    public function update(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::revision($input['expectedRevision']);/** @var ApiResponse<Definition> */
        return $this->functionRequest('PATCH', '/'.self::identifier($id), $input, $options);
    }
    /** @return ApiResponse<array{ok:true}> */
    public function delete(string $id, int $expectedRevision, ?RequestOptions $options = null): ApiResponse
    {
        self::revision($expectedRevision);/** @var ApiResponse<array{ok:true}> */
        return $this->functionRequest('DELETE', '/'.self::identifier($id), ['expectedRevision' => $expectedRevision], $options);
    }
}
