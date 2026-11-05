<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,CallConsentModels,HttpTransport,RequestOptions};

/**
 * @phpstan-import-type Retention from CallConsentModels
 * @phpstan-import-type UpdateRetention from CallConsentModels
 */
final class CallRetention extends PlatformResource
{
    public function __construct(HttpTransport $transport)
    {
        parent::__construct($transport, '/platform/call-retention');
        $this->server();
    }
    /** @return ApiResponse<Retention> */
    public function retrieve(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Retention> */ return $this->unwrapped('GET', $this->prefix, options:$options);
    }
    /** @param UpdateRetention $body
     * @return ApiResponse<Retention> */
    public function update(array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Retention> */ return $this->unwrapped('PUT', $this->prefix, $body, options:$options);
    }
}
