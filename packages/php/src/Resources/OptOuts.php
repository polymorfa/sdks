<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,SecurityModels};

/**
 * @phpstan-import-type OptOutSettings from SecurityModels
 * @phpstan-import-type UpdateOptOutSettings from SecurityModels
 * @phpstan-import-type StopInput from \Polymorfa\CampaignContractModels
 * @phpstan-import-type StopSettings from \Polymorfa\CampaignContractModels
 * @phpstan-import-type StopSummary from \Polymorfa\CampaignContractModels
 */
final class OptOuts extends Resource
{
    /**
     * @return \Polymorfa\ApiResponse<array{data:StopSettings}> */
    public function getConfirmationSettings(?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        /** @var \Polymorfa\ApiResponse<array{data:StopSettings}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/platform/optouts/confirmation-settings', [], null, $options, 'stopSettings', false, false, true);
    }

    /** @param StopInput $body
     * @return \Polymorfa\ApiResponse<array{data:StopSettings}> */
    public function updateConfirmationSettings(array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::stopConfirmation($body);
        /** @var \Polymorfa\ApiResponse<array{data:StopSettings}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'PUT', '/platform/optouts/confirmation-settings', [], \Polymorfa\CampaignContract::body($body), $options, 'stopSettings', false, false, true);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:StopSummary}> */
    public function getConfirmationSummary(?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        /** @var \Polymorfa\ApiResponse<array{data:StopSummary}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/platform/optouts/confirmation-summary', [], null, $options, 'stopSummary', false, false, true);
    }


    /** The merged TS contract leaves this payload open.
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array<string,mixed>}> */
        return $this->request('GET', '/platform/optouts', options:$options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function create(?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array<string,mixed>}> */
        return $this->request('POST', '/platform/optouts', $body === null ? null : (object)$body, options:$options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function createBatch(?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array<string,mixed>}> */
        return $this->request('POST', '/platform/optouts/batch', $body === null ? null : (object)$body, options:$options);
    }
    /** @return ApiResponse<array{data:OptOutSettings}> */
    public function getSettings(?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:OptOutSettings}> */
        return $this->request('GET', '/platform/optouts/settings', options:$options);
    }
    /** @param UpdateOptOutSettings $body
     * @return ApiResponse<array{data:OptOutSettings}> */
    public function updateSettings(array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:OptOutSettings}> */
        return $this->request('PUT', '/platform/optouts/settings', $body, options:$options);
    }
    /** @return ApiResponse<array{data:array<string,mixed>}> */
    public function delete(string $phone, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{data:array<string,mixed>}> */
        return $this->request('DELETE', '/platform/optouts/'.self::segment($phone), options:$options);
    }
}
