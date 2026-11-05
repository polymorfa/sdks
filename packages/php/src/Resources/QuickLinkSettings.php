<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,HttpTransport,QuickLinkSettingsModels,RequestOptions,ServerException};

/**
 * @phpstan-import-type Settings from QuickLinkSettingsModels
 * @phpstan-import-type UpdateInput from QuickLinkSettingsModels
 */
final class QuickLinkSettings extends PlatformResource
{
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null)
    {
        parent::__construct($transport, '/platform');
    }
    /** @return ApiResponse<Settings|null> */
    public function retrieve(?RequestOptions $options = null): ApiResponse
    {
        $response = $this->request('GET', '/platform/quicklink', query:$this->projectId === null ? [] : ['projectId' => $this->projectId], options:$options);
        if (!array_key_exists('data', $response->data) || ($response->data['data'] !== null && !is_array($response->data['data']))) {
            throw new ServerException('Invalid response envelope.', 'invalid_response', metadata:$response->metadata);
        }
        /** @var Settings|null $data */$data = $response->data['data'];
        return new ApiResponse($data, $response->metadata);
    }
    /** @param UpdateInput $input
     * @return ApiResponse<Settings> */
    public function update(array $input = [], ?RequestOptions $options = null): ApiResponse
    {
        if ($this->projectId !== null) {
            $input['projectId'] = $this->projectId;
        }
        /** @var ApiResponse<Settings> */return $this->unwrapped('PUT', '/platform/quicklink', (object)$input, options:$options);
    }
}
