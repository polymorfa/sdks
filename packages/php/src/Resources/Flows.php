<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,ConfigurationException,FlowModels,HttpTransport,RequestOptions,ServerException,ValidationException};

/**
 * @phpstan-import-type Summary from FlowModels
 * @phpstan-import-type Draft from FlowModels
 * @phpstan-import-type CreateInput from FlowModels
 * @phpstan-import-type UpdateInput from FlowModels
 * @phpstan-import-type ProviderInput from FlowModels
 * @phpstan-import-type ProviderResult from FlowModels
 * @phpstan-import-type ProviderOperation from FlowModels
 * @phpstan-import-type EndpointInput from FlowModels
 * @phpstan-import-type EndpointState from FlowModels
 * @phpstan-import-type EndpointSetResult from FlowModels
 * @phpstan-import-type ReceiptParams from FlowModels
 * @phpstan-import-type Receipt from FlowModels
 * @phpstan-import-type Custody from FlowModels
 * @phpstan-import-type Rotation from FlowModels
 */
final class Flows extends Resource
{
    public function __construct(HttpTransport $transport, private readonly string $projectId)
    {
        parent::__construct($transport);
    }
    /**
 * @return ApiResponse<list<Summary>> */
    public function list(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<list<Summary>> */ return $this->flowRequest('GET', '', [], $options);
    }
    /** @param CreateInput $input
 * @return ApiResponse<Draft> */
    public function create(array $input, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Draft> */ return $this->flowRequest('POST', '', $input, $options);
    }
    /**
 * @return ApiResponse<Draft|null> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        if (!preg_match('/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iD', $id)) {
            throw new ValidationException('flowId must be a valid UUID.', 'invalid_parameter');
        }
        /** @var ApiResponse<Draft|null> */ return $this->flowRequest('GET', self::path($id), [], $options);
    }
    /** @param UpdateInput $input
 * @return ApiResponse<Draft> */
    public function update(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::validateUpdate($input);
        /** @var ApiResponse<Draft> */ return $this->flowRequest('PATCH', self::path($id), $input, $options);
    }
    /**
 * @return ApiResponse<array{ok:true}> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{ok:true}> */ return $this->flowRequest('DELETE', self::path($id), [], $options);
    }
    /** @param ProviderInput $input
 * @return ApiResponse<ProviderResult> */
    public function upload(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<ProviderResult> */ return $this->flowRequest('POST', self::path($id).'/upload', $input, $options);
    }
    /** @param ProviderInput $input
 * @return ApiResponse<ProviderResult> */
    public function publish(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<ProviderResult> */ return $this->flowRequest('POST', self::path($id).'/publish', $input, $options);
    }
    /** @param ProviderInput $input
 * @return ApiResponse<ProviderResult> */
    public function deprecate(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<ProviderResult> */ return $this->flowRequest('POST', self::path($id).'/deprecate', $input, $options);
    }
    /** @param ProviderInput $input
 * @return ApiResponse<ProviderResult> */
    public function discard(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<ProviderResult> */ return $this->flowRequest('POST', self::path($id).'/discard', $input, $options);
    }
    /** @param ProviderInput $input
 * @return ApiResponse<ProviderResult> */
    public function sync(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<ProviderResult> */ return $this->flowRequest('POST', self::path($id).'/sync', $input, $options);
    }
    /**
 * @return ApiResponse<list<ProviderOperation>> */
    public function receipts(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<list<ProviderOperation>> */ return $this->flowRequest('GET', self::path($id).'/receipts', [], $options);
    }
    /**
 * @return ApiResponse<EndpointState> */
    public function endpoint(string $id, string $sessionId, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<EndpointState> */ return $this->flowRequest('GET', self::path($id).'/endpoint', self::number($sessionId), $options);
    }
    /** @param EndpointInput $input
 * @return ApiResponse<EndpointSetResult> */
    public function setEndpoint(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    {
        self::number($input['sessionId']);
        if ($input['mode'] === 'forward' || $input['mode'] === 'direct') {
            $url = parse_url($input['url']);
            if (strlen($input['url']) > 2048 || $url === false || ($url['scheme'] ?? '') !== 'https' || empty($url['host']) || isset($url['user']) || isset($url['pass']) || isset($url['fragment'])) {
                throw new ValidationException('url must be an HTTPS URL without credentials or a fragment.', 'invalid_parameter');
            }
        } elseif ($input['mode'] === 'function') {
            if ($input['functionId'] === '') {
                throw new ValidationException('functionId is required.', 'invalid_parameter');
            }
        } else {
            throw new ValidationException('Invalid endpoint mode.', 'invalid_parameter');
        }
        if (isset($input['expectedRevision']) && $input['expectedRevision'] < 1) {
            throw new ValidationException('expectedRevision must be positive.', 'invalid_parameter');
        }
        /** @var ApiResponse<EndpointSetResult> */ return $this->flowRequest('PUT', self::path($id).'/endpoint', $input, $options);
    }
    /**
 * @return ApiResponse<array{ok:true}> */
    public function deleteEndpoint(string $id, string $sessionId, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{ok:true}> */ return $this->flowRequest('DELETE', self::path($id).'/endpoint', self::number($sessionId), $options);
    }
    /** @param ReceiptParams $params
 * @return ApiResponse<list<Receipt>> */
    public function endpointReceipts(string $id, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        if (isset($params['limit']) && ($params['limit'] < 1 || $params['limit'] > 100)) {
            throw new ValidationException('limit must be from 1 to 100.', 'invalid_parameter');
        }
        /** @var ApiResponse<list<Receipt>> */ return $this->flowRequest('GET', self::path($id).'/endpoint/receipts', $params, $options);
    }
    /**
 * @return ApiResponse<Custody> */
    public function encryptionKey(string $sessionId, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Custody> */ return $this->flowRequest('GET', '', self::number($sessionId), $options, '/platform/flow-encryption-keys');
    }
    /**
 * @return ApiResponse<Rotation> */
    public function rotateEncryptionKey(string $sessionId, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Rotation> */ return $this->flowRequest('POST', '', self::number($sessionId), $options, '/platform/flow-encryption-keys/rotate');
    }
    /** @param array<string,mixed> $input */
    private static function validateUpdate(array $input): void
    {
        $value = $input['expectedUpdatedAt'] ?? null;
        if ((!is_int($value) && !is_float($value)) || !is_finite((float)$value)) {
            throw new ValidationException('expectedUpdatedAt must be finite.', 'invalid_parameter');
        }
    }
    private static function path(string $id): string
    {
        if (trim($id) === '') {
            throw new ConfigurationException('flowId');
        } return '/'.self::segment($id);
    }
    /**
 * @return array{sessionId:string} */
    private static function number(string $id): array
    {
        if (trim($id) === '') {
            throw new ValidationException('sessionId is required.', 'invalid_parameter');
        } return ['sessionId' => $id];
    }
    /** @param array<string,mixed> $input
 * @return ApiResponse<mixed> */
    private function flowRequest(string $method, string $path, array $input, ?RequestOptions $options, string $base = '/platform/flows'): ApiResponse
    {
        $this->server();
        if (array_key_exists('projectId', $input) || array_key_exists('flowId', $input)) {
            throw new ConfigurationException('input');
        }
        $input['projectId'] = $this->projectId;
        if ($method !== 'GET') {
            $options = ($options ?? new RequestOptions())->withoutRetries();
        }
        $queryOnly = $method === 'GET' || $method === 'DELETE';
        $r = $this->request($method, $base.$path, $queryOnly ? null : $input, $queryOnly ? $input : [], $options);
        if (!array_key_exists('data', $r->data)) {
            throw new ServerException('Invalid response envelope.', 'invalid_response', metadata:$r->metadata);
        }
        return new ApiResponse($r->data['data'], $r->metadata);
    }
}
