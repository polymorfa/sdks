<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,ConfigurationException,RequestOptions};

/** @phpstan-import-type MarketingStatus from \Polymorfa\OfficialRound2Models */
final class CloudMarketing extends Resource
{
    /** Beta Number status. Unknown observations never grant access.
     * @return ApiResponse<array{success:true,data:MarketingStatus}> */
    public function getStatus(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (trim($session) === '' || strlen($session) > 128) { throw new \Polymorfa\ValidationException('Provide a Number ID of 1 to 128 characters.'); }
        /** @var ApiResponse<array{success:true,data:MarketingStatus}> */
        return $this->request('GET', '/messaging/'.self::segment($session).'/marketing-messages/status', options:$options);
    }
    /** These raw provider observations never grant eligibility or terms.
     * @param array{version:string} $params
     * @return ApiResponse<array{id:string,marketing_messages_lite_api_status?:string,marketing_messages_onboarding_status?:string,owner_business_info?:array{marketing_messages_onboarding_status?:array{status?:string,time?:string}},disable_marketing_messages_on_cloud_api?:bool}> */
    public function status(string $wabaId, array $params, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (trim($wabaId) === '' || trim($params['version']) === '') {
            throw new ConfigurationException('wabaId');
        }
        /** @var ApiResponse<array{id:string,marketing_messages_lite_api_status?:string,marketing_messages_onboarding_status?:string,owner_business_info?:array{marketing_messages_onboarding_status?:array{status?:string,time?:string}},disable_marketing_messages_on_cloud_api?:bool}> */
        return $this->request('GET', '/graph/whatsapp/'.self::segment($params['version']).'/'.self::segment($wabaId).'/marketing_messages/status', options:$options);
    }
}
