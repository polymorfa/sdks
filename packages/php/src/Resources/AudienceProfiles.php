<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

/**
 * @phpstan-import-type Profile from \Polymorfa\AudienceProfileModels as AudienceProfile
 * @phpstan-import-type PutInput from \Polymorfa\AudienceProfileModels
 * @phpstan-import-type Consent from \Polymorfa\AudienceProfileModels
 * @phpstan-import-type ProfilePage from \Polymorfa\AudienceProfileModels
 * @phpstan-import-type ConsentPage from \Polymorfa\AudienceProfileModels
 * @phpstan-import-type PageParams from \Polymorfa\AudienceProfileModels
 * @phpstan-import-type DeleteResult from \Polymorfa\AudienceProfileModels
 */
final class AudienceProfiles extends Resource
{
    public readonly AudienceProfileImports $imports;

    public function __construct(\Polymorfa\HttpTransport $transport)
    {
        parent::__construct($transport);
        $this->imports = new AudienceProfileImports($transport);
    }

    /** @param PageParams $params
     * @return \Polymorfa\ApiResponse<ProfilePage> */
    public function list(array $params = [], ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::page($params);
        /** @var \Polymorfa\ApiResponse<ProfilePage> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/platform/audience-profiles', $params, null, $options, 'profiles', false, false, true);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:AudienceProfile}> */
    public function retrieve(string $phone, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::phone($phone);
        /** @var \Polymorfa\ApiResponse<array{data:AudienceProfile}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/platform/audience-profiles/'.rawurlencode($phone), [], null, $options, 'profile', false, false, true);
    }

    /** @param PutInput $body
     * @return \Polymorfa\ApiResponse<array{data:AudienceProfile}> */
    public function put(string $phone, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::phone($phone);
        \Polymorfa\CampaignContractValidation::profile($body);
        /** @var \Polymorfa\ApiResponse<array{data:AudienceProfile}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'PUT', '/platform/audience-profiles/'.rawurlencode($phone), [], \Polymorfa\CampaignContract::body($body), $options, 'profile', false, false, true);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:DeleteResult}> */
    public function delete(string $phone, int $expectedRevision, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::phone($phone);
        \Polymorfa\CampaignContractValidation::integer($expectedRevision, 'expectedRevision', 1);
        /** @var \Polymorfa\ApiResponse<array{data:DeleteResult}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'DELETE', '/platform/audience-profiles/'.rawurlencode($phone), ['expectedRevision' => $expectedRevision], null, $options, 'profileDelete', false, false, true);
    }

    /** @param PageParams $params
     * @return \Polymorfa\ApiResponse<ConsentPage> */
    public function listConsent(string $phone, array $params = [], ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::phone($phone);
        \Polymorfa\CampaignContractValidation::page($params);
        /** @var \Polymorfa\ApiResponse<ConsentPage> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/platform/audience-profiles/'.rawurlencode($phone).'/consent', $params, null, $options, 'consents', false, false, true);
    }

}
