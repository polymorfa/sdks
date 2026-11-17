<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,HttpTransport,ConnectionModels,RequestOptions};

/**
 * @phpstan-import-type Configuration from ConnectionModels
 * @phpstan-import-type ConfigurationPatch from ConnectionModels
 */
final class ConnectionConfiguration extends PlatformResource
{
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null)
    {
        parent::__construct($transport, '/platform');
    }
    /** @return ApiResponse<Configuration> */
    public function retrieve(?RequestOptions $options = null): ApiResponse
    {
        $response = \Polymorfa\ExistingContract::request($this->transport, 'GET', '/platform/connection-configuration', query:$this->projectId === null ? [] : ['projectId' => $this->projectId], options:$options, model:'configuration');
        /** @var Configuration $data */ $data = $response->data['data'];
        return new ApiResponse($data, $response->metadata);
    }
    /** @param array{configuration:ConfigurationPatch,revision:int} $input
     * @return ApiResponse<Configuration> */
    public function update(array $input, ?RequestOptions $options = null): ApiResponse
    {
        $options = \Polymorfa\ExistingContract::options($options, \Polymorfa\ConnectionDeliveryValidation::configuration($input));
        if ($this->projectId !== null) {
            $input['projectId'] = $this->projectId;
        }
        $response = \Polymorfa\ExistingContract::request($this->transport, 'PUT', '/platform/connection-configuration', $input, options:$options, model:'configuration');
        /** @var Configuration $data */ $data = $response->data['data'];
        return new ApiResponse($data, $response->metadata);
    }
}
