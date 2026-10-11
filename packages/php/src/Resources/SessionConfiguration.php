<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,HttpTransport,SessionModels,RequestOptions};

/**
 * @phpstan-import-type Configuration from SessionModels
 * @phpstan-import-type ConfigurationPatch from SessionModels
 */
final class SessionConfiguration extends PlatformResource
{
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null)
    {
        parent::__construct($transport, '/platform');
    }
    /** @return ApiResponse<Configuration> */
    public function retrieve(?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<Configuration> */return $this->unwrapped('GET', '/platform/session-configuration', query:$this->projectId === null ? [] : ['projectId' => $this->projectId], options:$options);
    }
    /** @param array{configuration:ConfigurationPatch,revision:int} $input
     * @return ApiResponse<Configuration> */
    public function update(array $input, ?RequestOptions $options = null): ApiResponse
    {
        if ($this->projectId !== null) {
            $input['projectId'] = $this->projectId;
        }
        /** @var ApiResponse<Configuration> */return $this->unwrapped('PUT', '/platform/session-configuration', $input, options:$options);
    }
}
