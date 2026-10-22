<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,CallConsentModels,HttpTransport,RequestOptions,ValidationException};

/**
 * @phpstan-import-type Policy from CallConsentModels
 * @phpstan-import-type UpdatePolicy from CallConsentModels
 */
final class CallPolicy extends PlatformResource
{
    public function __construct(HttpTransport $transport)
    {
        parent::__construct($transport, '/platform/call-policy');
        $this->server();
    }
    /** @return ApiResponse<Policy> */
    public function retrieve(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Policy> */ return $this->unwrapped('GET', $this->prefix, options:$options);
    }
    /** @param UpdatePolicy $body
     * @return ApiResponse<Policy> */
    public function update(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->validate($body);
        /** @var ApiResponse<Policy> */ return $this->unwrapped('PUT', $this->prefix, $body, options:$options);
    }
    /** @param array<string,mixed> $body */
    private function validate(array $body): void
    {
        $codes = $body['blockedCountryCodes'] ?? null;
        if (!is_array($codes) || !array_is_list($codes) || count($codes) > 300) {
            throw new ValidationException('blockedCountryCodes holds at most 300 codes.');
        }
        foreach ($codes as $code) {
            if (!is_string($code) || preg_match('/^[1-9][0-9]{0,3}$/D', $code) !== 1) {
                throw new ValidationException('A country calling prefix has 1 to 4 digits without +.');
            }
        }
        if (array_key_exists('expectedRevision', $body) && (!is_int($body['expectedRevision']) || $body['expectedRevision'] < 0 || $body['expectedRevision'] > 9007199254740991)) {
            throw new ValidationException('expectedRevision must be a non-negative safe integer.');
        }
    }
}
