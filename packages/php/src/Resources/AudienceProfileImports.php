<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

/**
 * @phpstan-import-type ImportInput from \Polymorfa\AudienceProfileModels
 * @phpstan-import-type ImportJob from \Polymorfa\AudienceProfileModels
 */
final class AudienceProfileImports extends Resource
{
    /** @param ImportInput $body
     * @return \Polymorfa\ApiResponse<array{data:ImportJob}> */
    public function create(array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::profileImport($body);
        /** @var \Polymorfa\ApiResponse<array{data:ImportJob}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'POST', '/platform/audience-profile-imports', [], \Polymorfa\CampaignContract::body($body), $options, 'import', false, false, true);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:ImportJob}> */
    public function retrieve(string $id, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::uuid($id, 'jobId');
        /** @var \Polymorfa\ApiResponse<array{data:ImportJob}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/platform/audience-profile-imports/'.rawurlencode($id), [], null, $options, 'import', false, false, true);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:ImportJob}> */
    public function cancel(string $id, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::uuid($id, 'jobId');
        /** @var \Polymorfa\ApiResponse<array{data:ImportJob}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'DELETE', '/platform/audience-profile-imports/'.rawurlencode($id), [], null, $options, 'import', false, false, true);
    }

}
