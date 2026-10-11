<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,ConfigurationException,RequestOptions};

final class CloudMarketing extends Resource
{
    /** These raw provider observations never grant eligibility or terms.
     * @param array{version:string} $params
     * @return ApiResponse<array{id:string,marketing_messages_lite_api_status?:string,marketing_messages_onboarding_status?:string}> */
    public function status(string $wabaId, array $params, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (trim($wabaId) === '' || trim($params['version']) === '') {
            throw new ConfigurationException('wabaId');
        }
        /** @var ApiResponse<array{id:string,marketing_messages_lite_api_status?:string,marketing_messages_onboarding_status?:string}> */
        return $this->request('GET', '/graph/whatsapp/'.self::segment($params['version']).'/'.self::segment($wabaId).'/marketing_messages/status', options:$options);
    }
}
