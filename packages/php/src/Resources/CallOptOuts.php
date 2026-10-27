<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,CallConsentModels,ConfigurationException,CursorPage,HttpTransport,RequestOptions,ValidationException};

/**
 * @phpstan-import-type OptOut from CallConsentModels
 * @phpstan-import-type ListOptOuts from CallConsentModels
 * @phpstan-import-type CreateOptOut from CallConsentModels
 * @phpstan-import-type ImportRequest from CallConsentModels
 * @phpstan-import-type ImportResult from CallConsentModels
 * @phpstan-import-type Deleted from CallConsentModels
 */
final class CallOptOuts extends PlatformResource
{
    public function __construct(HttpTransport $transport)
    {
        parent::__construct($transport, '/platform/call-opt-outs');
        $this->server();
    }
    /** @param ListOptOuts $params
     * @return CursorPage<OptOut> */
    public function list(array $params = [], ?RequestOptions $options = null): CursorPage
    {
        if (isset($params['phoneNumber'],$params['bsuid'])) {
            throw new ValidationException('Filter by phoneNumber or bsuid.');
        }
        /** @var CursorPage<OptOut> */ return $this->page($this->prefix, $params, $options);
    }
    /** @param CreateOptOut $body
     * @return ApiResponse<OptOut> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->validateIdentity($body);
        /** @var ApiResponse<OptOut> */ return $this->unwrapped('POST', $this->prefix, $body, options:$options);
    }
    /** @param array<string,mixed> $body */
    private function validateIdentity(array $body): void
    {
        $phone = $body['phoneNumber'] ?? null;
        $bsuid = $body['bsuid'] ?? null;
        if ((is_string($phone) && $phone !== '') === (is_string($bsuid) && $bsuid !== '')) {
            throw new ValidationException('Supply exactly one phoneNumber or bsuid.');
        }
    }
    /** @param ImportRequest $body
     * @return ApiResponse<ImportResult> */
    public function import(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->validateImport($body);
        /** @var ApiResponse<ImportResult> */ return $this->unwrapped('POST', $this->prefix.'/import', $body, options:$options);
    }
    /** @param array<string,mixed> $body */
    private function validateImport(array $body): void
    {
        $entries = $body['entries'] ?? null;
        if (!is_array($entries) || !array_is_list($entries) || count($entries) < 1 || count($entries) > 5000) {
            throw new ValidationException('entries holds 1 to 5000 import entries.');
        }
    }
    /** @return ApiResponse<Deleted> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    {
        if (trim($id) === '') {
            throw new ConfigurationException('A call opt-out ID is required.');
        }
        /** @var ApiResponse<Deleted> */ return $this->unwrapped('DELETE', $this->prefix.'/'.rawurlencode($id), options:$options);
    }
}
