<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,FunctionModels,RequestOptions};

/**
 * @phpstan-import-type ListParams from FunctionModels
 * @phpstan-import-type Invocation from FunctionModels
 * @phpstan-import-type CreateInvocation from FunctionModels
 * @phpstan-import-type InvocationResult from FunctionModels
 */
final class FunctionInvocations extends FunctionResource
{
    /** @param ListParams $params
     * @return ApiResponse<array{items:list<Invocation>,nextCursor:?string}> */
    public function list(string $functionId, array $params = [], ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<array{items:list<Invocation>,nextCursor:?string}> */return $this->functionRequest('GET', '/'.self::identifier($functionId).'/invocations', $params, $options);
    }
    /** @return ApiResponse<Invocation> */
    public function retrieve(string $functionId, string $invocationId, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<Invocation> */return $this->functionRequest('GET', '/'.self::identifier($functionId).'/invocations/'.self::identifier($invocationId), options:$options);
    }
    /** @param CreateInvocation $input
     * @return ApiResponse<InvocationResult> */
    public function create(string $functionId, array $input, RequestOptions $options): ApiResponse
    {
        if ($options->idempotencyKey === null || !preg_match('/^[\x21-\x7e]{1,128}$/D', $options->idempotencyKey)) {
            self::invalid('A valid invocation idempotency key is required.');
        }
        if (isset($input['deploymentId'])) {
            self::identifier($input['deploymentId']);
        }
        $input['request']['headers'] = (object)$input['request']['headers'];
        /** @var ApiResponse<InvocationResult> */return $this->functionRequest('POST', '/'.self::identifier($functionId).'/invocations', $input, $options);
    }
}
