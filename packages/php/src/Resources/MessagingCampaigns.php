<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,CampaignModels,ValidationException,ExistingContract,ExistingCampaignValidation};

/**
 * @phpstan-import-type MessagingLaunch from CampaignModels
 * @phpstan-import-type RecipientParams from CampaignModels
 * @phpstan-import-type Campaign from CampaignModels
 * @phpstan-import-type CreateInput from CampaignModels
 * @phpstan-import-type UpdateInput from CampaignModels
 * @phpstan-import-type CampaignOperation from CampaignModels
 * @phpstan-import-type CampaignStop from CampaignModels
 * @phpstan-import-type Analytics from CampaignModels
 * @phpstan-import-type Recipient from CampaignModels
 * @phpstan-import-type RecipientInput from CampaignModels
 * @phpstan-import-type Status from CampaignModels
 * @phpstan-import-type AddedRecipients from CampaignModels
 * @phpstan-import-type ReplyFlow from \Polymorfa\CampaignContractModels
 * @phpstan-import-type ReplyCreate from \Polymorfa\CampaignContractModels
 * @phpstan-import-type AssignmentInput from \Polymorfa\CampaignContractModels
 * @phpstan-import-type Assignment from \Polymorfa\CampaignContractModels
 * @phpstan-import-type TestSendInput from \Polymorfa\CampaignContractModels
 * @phpstan-import-type TestSend from \Polymorfa\CampaignContractModels
 * @phpstan-import-type LinkReport from \Polymorfa\CampaignContractModels
 * @phpstan-import-type ExportParams from \Polymorfa\CampaignContractModels
 */
final class MessagingCampaigns extends Resource
{
    /** @param TestSendInput $body
     * @return \Polymorfa\ApiResponse<array{success:true,data:TestSend}> */
    public function testSend(string $projectSlug, string $id, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        $this->server();
        \Polymorfa\CampaignContractValidation::text($projectSlug, 'projectSlug');
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        \Polymorfa\CampaignContractValidation::testSend($body);
        /** @var \Polymorfa\ApiResponse<array{success:true,data:TestSend}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'POST', $this->path($projectSlug, $id).'/test-send', [], \Polymorfa\CampaignContract::body($body), $options, 'testSend', true, true, false);
    }

    /** @param ReplyCreate $body
     * @return \Polymorfa\ApiResponse<array{success:true,data:ReplyFlow}> */
    public function createReplyFlow(string $projectSlug, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        $this->server();
        \Polymorfa\CampaignContractValidation::text($projectSlug, 'projectSlug');
        \Polymorfa\CampaignContractValidation::replyCreate($body);
        /** @var \Polymorfa\ApiResponse<array{success:true,data:ReplyFlow}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'POST', '/messaging/projects/'.self::segment($projectSlug).'/campaign-reply-flows', [], \Polymorfa\CampaignContract::body($body), $options, 'replyFlow', true, false, false);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{success:true,data:ReplyFlow}> */
    public function getReplyFlow(string $projectSlug, string $id, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        $this->server();
        \Polymorfa\CampaignContractValidation::text($projectSlug, 'projectSlug');
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        /** @var \Polymorfa\ApiResponse<array{success:true,data:ReplyFlow}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', '/messaging/projects/'.self::segment($projectSlug).'/campaign-reply-flows/'.self::segment($id), [], null, $options, 'replyFlow', true, false, false);
    }

    /** @param AssignmentInput $body
     * @return \Polymorfa\ApiResponse<array{success:true,data:Assignment}> */
    public function setReplyFlow(string $projectSlug, string $id, array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        $this->server();
        \Polymorfa\CampaignContractValidation::text($projectSlug, 'projectSlug');
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        \Polymorfa\CampaignContractValidation::assignment($body);
        /** @var \Polymorfa\ApiResponse<array{success:true,data:Assignment}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'PUT', $this->path($projectSlug, $id).'/reply-flow', [], \Polymorfa\CampaignContract::body($body), $options, 'assignment', true, false, false);
    }

    /**
     * @return \Polymorfa\ApiResponse<array{success:true,data:list<LinkReport>}> */
    public function links(string $projectSlug, string $id, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        $this->server();
        \Polymorfa\CampaignContractValidation::text($projectSlug, 'projectSlug');
        \Polymorfa\CampaignContractValidation::uuid($id, 'id');
        /** @var \Polymorfa\ApiResponse<array{success:true,data:list<LinkReport>}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'GET', $this->path($projectSlug, $id).'/links', [], null, $options, 'links', true, false, false);
    }

    /** @param ExportParams $params
     * @return \Polymorfa\ApiResponse<\Polymorfa\CampaignRecipientExportPage> */
    public function exportRecipients(string $projectSlug, string $id, array $params = [], ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        $this->server();
        \Polymorfa\CampaignContractValidation::text($projectSlug, 'projectSlug');
        \Polymorfa\CampaignContractValidation::uuid($id, 'campaignId');
        \Polymorfa\CampaignContractValidation::export($params);
        return \Polymorfa\CampaignContract::export($this->transport, $this->path($projectSlug, $id).'/recipients/export', $params, $options);
    }


    /** @return ApiResponse<array{success:true,data:list<Campaign>}> */
    public function list(string $projectSlug, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:list<Campaign>}> */ return ExistingContract::request($this->transport, 'GET', $this->path($projectSlug), options:$options, model:'campaigns', messaging:true);
    }
    /** @param CreateInput $body
     * @return ApiResponse<array{success:true,data:Campaign}> */
    public function create(string $projectSlug, array $body, ?RequestOptions $options = null): ApiResponse
    {
        ExistingCampaignValidation::input($body, false, false);
        /** @var ApiResponse<array{success:true,data:Campaign}> */ return ExistingContract::request($this->transport, 'POST', $this->path($projectSlug), $body, options:($options ?? new RequestOptions())->withIdempotencyKey(), model:'campaign', messaging:true);
    }
    /** @return ApiResponse<array{success:true,data:Campaign}> */
    public function retrieve(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:Campaign}> */ return ExistingContract::request($this->transport, 'GET', $this->path($projectSlug, $id), options:$options, model:'campaign', messaging:true);
    }
    /** @param UpdateInput $body
     * @return ApiResponse<array{success:true,data:Campaign}> */
    public function update(string $projectSlug, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        ExistingCampaignValidation::input($body, false, true);
        if ($body === []) {
            throw new ValidationException('Supply at least one draft field.');
        } /** @var ApiResponse<array{success:true,data:Campaign}> */ return ExistingContract::request($this->transport, 'PATCH', $this->path($projectSlug, $id), $body, options:($options ?? new RequestOptions())->withoutAutomaticRetry(), model:'campaign', messaging:true);
    }
    /** @return ApiResponse<array{success:true,data:Analytics}> */
    public function analytics(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:Analytics}> */ return ExistingContract::request($this->transport, 'GET', $this->path($projectSlug, $id).'/analytics', options:$options, model:'campaignAnalytics', messaging:true);
    }
    /** @param MessagingLaunch $body
     * @return ApiResponse<array{success:true,data:CampaignOperation}> */
    public function launch(string $projectSlug, string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        ExistingCampaignValidation::launch($body, false);
        /** @var ApiResponse<array{success:true,data:CampaignOperation}> */ return ExistingContract::request($this->transport, 'POST', $this->path($projectSlug, $id).'/launch', $body === [] ? new \stdClass() : $body, options:($options ?? new RequestOptions())->withIdempotencyKey(), model:'campaignOperation', messaging:true);
    }
    /** @param array{scheduledAt:int|float|null} $body
     * @return ApiResponse<array{success:true,data:CampaignOperation}> */
    public function reschedule(string $projectSlug, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignOperation}> */ return ExistingContract::request($this->transport, 'POST', $this->path($projectSlug, $id).'/reschedule', $body, options:($options ?? new RequestOptions())->withIdempotencyKey(), model:'campaignOperation', messaging:true);
    }
    /** @return ApiResponse<array{success:true,data:CampaignOperation}> */
    public function pause(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignOperation}> */ return ExistingContract::request($this->transport, 'POST', $this->path($projectSlug, $id).'/pause', options:($options ?? new RequestOptions())->withIdempotencyKey(), model:'campaignOperation', messaging:true);
    }
    /** @return ApiResponse<array{success:true,data:CampaignOperation}> */
    public function resume(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignOperation}> */ return ExistingContract::request($this->transport, 'POST', $this->path($projectSlug, $id).'/resume', options:($options ?? new RequestOptions())->withIdempotencyKey(), model:'campaignOperation', messaging:true);
    }
    /** @return ApiResponse<array{success:true,data:CampaignStop}> */
    public function stop(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignStop}> */ return ExistingContract::request($this->transport, 'POST', $this->path($projectSlug, $id).'/stop', options:($options ?? new RequestOptions())->withIdempotencyKey(), model:'campaignStop', messaging:true);
    }
    /** @param RecipientParams $params
     * @return ApiResponse<array{success:true,data:list<Recipient>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listRecipients(string $projectSlug, string $id, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        ExistingCampaignValidation::recipients($params, false);
        /** @var ApiResponse<array{success:true,data:list<Recipient>,page:array{nextCursor:?string,hasMore:bool}}> */ return ExistingContract::request($this->transport, 'GET', $this->path($projectSlug, $id).'/recipients', query:$params, options:$options, model:'recipients', messaging:true);
    }
    /** @param array{recipients:list<RecipientInput>} $body
     * @return ApiResponse<array{success:true,data:AddedRecipients}> */
    public function addRecipients(string $projectSlug, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:AddedRecipients}> */ return ExistingContract::request($this->transport, 'POST', $this->path($projectSlug, $id).'/recipients', $body, options:($options ?? new RequestOptions())->withoutAutomaticRetry(), model:'addedRecipients', messaging:true);
    }
    /** @param array{includeSkippedError?:bool} $body
     * @return ApiResponse<array{success:true,data:array{requeued:int}}> */
    public function requeue(string $projectSlug, string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:array{requeued:int}}> */ return $this->request('POST', $this->path($projectSlug, $id).'/requeue', $body === [] ? new \stdClass() : $body, options:$options);
    }
    private function path(string $projectSlug, ?string $id = null): string
    {
        return '/messaging/projects/'.self::segment($projectSlug).'/campaigns'.($id === null ? '' : '/'.self::segment($id));
    }
}
