<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,CampaignModels};

/**
 * @phpstan-import-type PlatformCampaign from CampaignModels
 * @phpstan-import-type PlatformCreate from CampaignModels
 * @phpstan-import-type PlatformUpdate from CampaignModels
 * @phpstan-import-type PlatformAnalytics from CampaignModels
 * @phpstan-import-type Recipient from CampaignModels
 * @phpstan-import-type RecipientInput from CampaignModels
 * @phpstan-import-type Status from CampaignModels
 * @phpstan-import-type AddedRecipients from CampaignModels
 * @phpstan-import-type ConversionInput from CampaignModels
 * @phpstan-import-type Conversion from CampaignModels
 * @phpstan-import-type ConversionReport from CampaignModels
 * @phpstan-import-type ReplyFlow from \Polymorfa\CampaignContractModels
 * @phpstan-import-type PlatformReplyCreate from \Polymorfa\CampaignContractModels
 * @phpstan-import-type PlatformAssignmentInput from \Polymorfa\CampaignContractModels
 * @phpstan-import-type Assignment from \Polymorfa\CampaignContractModels
 * @phpstan-import-type PlatformTestSendInput from \Polymorfa\CampaignContractModels
 * @phpstan-import-type TestSend from \Polymorfa\CampaignContractModels
 * @phpstan-import-type LinkReport from \Polymorfa\CampaignContractModels
 * @phpstan-import-type ProjectParams from \Polymorfa\CampaignContractModels
 * @phpstan-import-type Approval from \Polymorfa\CampaignContractModels
 * @phpstan-import-type Settings from \Polymorfa\CampaignContractModels
 * @phpstan-import-type PlatformExportParams from \Polymorfa\CampaignContractModels
 */
final class Campaigns extends Resource
{
    /** @param PlatformTestSendInput $body
     * @return \Polymorfa\ApiResponse<array{data:TestSend}> */
    public function testSend(string $id, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        \Polymorfa\CampaignContractValidation::testSend($body, true);
        /** @var \Polymorfa\ApiResponse<array{data:TestSend}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'POST', $this->path($id).'/test-send', [], \Polymorfa\CampaignContract::body($body), $options, 'testSend', false, true, false);
    }

    /** @param PlatformReplyCreate $body
     * @return \Polymorfa\ApiResponse<array{data:ReplyFlow}> */
    public function createReplyFlow(array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::replyCreate($body, true);
        /** @var \Polymorfa\ApiResponse<array{data:ReplyFlow}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'POST', '/platform/campaign-reply-flows', [], \Polymorfa\CampaignContract::body($body), $options, 'replyFlow', false, false, false);
    }

    /** @param ProjectParams $params
     * @return \Polymorfa\ApiResponse<array{data:ReplyFlow}> */
    public function getReplyFlow(string $id, array $params, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        \Polymorfa\CampaignContractValidation::selection($params);
        /** @var \Polymorfa\ApiResponse<array{data:ReplyFlow}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/platform/campaign-reply-flows/'.self::segment($id), $params, null, $options, 'replyFlow', false, false, false);
    }

    /** @param PlatformAssignmentInput $body
     * @return \Polymorfa\ApiResponse<array{data:Assignment}> */
    public function setReplyFlow(string $id, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        \Polymorfa\CampaignContractValidation::assignment($body, true);
        /** @var \Polymorfa\ApiResponse<array{data:Assignment}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'PUT', $this->path($id).'/reply-flow', [], \Polymorfa\CampaignContract::body($body), $options, 'assignment', false, false, false);
    }

    /** @param ProjectParams $params
     * @return \Polymorfa\ApiResponse<array{data:list<LinkReport>}> */
    public function links(string $id, array $params, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        \Polymorfa\CampaignContractValidation::selection($params);
        /** @var \Polymorfa\ApiResponse<array{data:list<LinkReport>}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', $this->path($id).'/links', $params, null, $options, 'links', false, false, false);
    }

    /** @param ProjectParams $params
     * @return \Polymorfa\ApiResponse<array{data:list<Approval>}> */
    public function listLaunchApprovals(string $id, array $params, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        \Polymorfa\CampaignContractValidation::selection($params);
        /** @var \Polymorfa\ApiResponse<array{data:list<Approval>}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', $this->path($id).'/approvals', $params, null, $options, 'approvals', false, false, false);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{data:Settings}> */
    public function getSettings(?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        /** @var \Polymorfa\ApiResponse<array{data:Settings}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/platform/campaign-settings', [], null, $options, 'settings', false, false, true);
    }

    /** @param PlatformExportParams $params
     * @return \Polymorfa\ApiResponse<\Polymorfa\CampaignRecipientExportPage> */
    public function exportRecipients(string $id, array $params, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::uuid($id, 'campaignId');
        \Polymorfa\CampaignContractValidation::export($params, true);
        return \Polymorfa\CampaignContract::export($this->transport, $this->path($id).'/recipients/export', $params, $options);
    }


    /** @param array{projectId:string,projectSlug?:string} $params
     * @return ApiResponse<array{data:list<PlatformCampaign>}> */
    public function list(array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<PlatformCampaign>}> */ return $this->request('GET', '/platform/campaigns', query:$params, options:$options);
    }
    /** @param PlatformCreate $body
     * @return ApiResponse<array{data:PlatformCampaign}> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    {
        $options ??= new RequestOptions();
        $one = new RequestOptions($options->timeout, 0, $options->apiVersion, null, $options->headers, $options->cancellation);
        /** @var ApiResponse<array{data:PlatformCampaign}> */ return $this->request('POST', '/platform/campaigns', $body, options:$one);
    }
    /** @param array{projectId:string} $params
     * @return ApiResponse<array{data:PlatformCampaign|null}> */
    public function retrieve(string $id, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:PlatformCampaign|null}> */ return $this->request('GET', $this->path($id), query:$params, options:$options);
    }
    /** @param PlatformUpdate|null $body
     * @param array{projectId:string} $params
     * @return ApiResponse<array{data:PlatformCampaign}> */
    public function update(string $id, ?array $body, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:PlatformCampaign}> */ return $this->request('PATCH', $this->path($id), $body === [] ? new \stdClass() : $body, query:$params, options:$options);
    }
    /** @param array{projectId:string} $params
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function delete(string $id, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('DELETE', $this->path($id), query:$params, options:$options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function launch(string $id, ?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->action($id, 'launch', $body, ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @param array{projectId:string,scheduledAt:int|float|null} $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function reschedule(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        return $this->action($id, 'reschedule', $body, ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function pause(string $id, ?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->action($id, 'pause', $body, ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function resume(string $id, ?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->action($id, 'resume', $body, ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function stop(string $id, ?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->action($id, 'stop', $body, ($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function archive(string $id, ?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->action($id, 'archive', $body, $options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function duplicate(string $id, ?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->action($id, 'duplicate', $body, $options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function requeue(string $id, ?array $body = null, ?RequestOptions $options = null): ApiResponse
    {
        return $this->action($id, 'requeue', $body, $options);
    }
    /** @param array{projectId:string} $params
     * @return ApiResponse<array{data:PlatformAnalytics}> */
    public function analytics(string $id, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:PlatformAnalytics}> */ return $this->request('GET', $this->path($id).'/analytics', query:$params, options:$options);
    }
    /** @param array{projectId:string} $params
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function events(string $id, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('GET', $this->path($id).'/events', query:$params, options:$options);
    }
    /** @param array{projectId:string,status?:Status,cursor?:string,limit?:int} $params
     * @return ApiResponse<array{data:list<Recipient>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function recipients(string $id, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<Recipient>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', $this->path($id).'/recipients', query:$params, options:$options);
    }
    /** @param array{projectId:string,recipients:list<RecipientInput>} $body
     * @return ApiResponse<array{data:AddedRecipients}> */
    public function addRecipients(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:AddedRecipients}> */ return $this->request('POST', $this->path($id).'/recipients', $body, options:($options ?? new RequestOptions())->withoutAutomaticRetry());
    }
    /** @param ConversionInput $body
     * @return ApiResponse<array{data:Conversion}> */
    public function recordConversion(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:Conversion}> */ return $this->request('POST', $this->path($id).'/conversions', $body, options:$options);
    }
    /** @param array{projectId:string} $params
     * @return ApiResponse<array{data:ConversionReport}> */
    public function conversions(string $id, array $params, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:ConversionReport}> */ return $this->request('GET', $this->path($id).'/conversions', query:$params, options:$options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    private function action(string $id, string $action, ?array $body, ?RequestOptions $options): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('POST', $this->path($id).'/'.$action, $body === [] ? new \stdClass() : $body, options:$options);
    }
    private function path(string $id): string
    {
        return '/platform/campaigns/'.self::segment($id);
    }
}
