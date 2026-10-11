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
 */
final class Campaigns extends Resource
{
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
    private function action(string $id,string $action,?array $body,?RequestOptions $options): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('POST',$this->path($id).'/'.$action,$body === [] ? new \stdClass() : $body,options:$options);
    }
    private function path(string $id): string
    {
        return '/platform/campaigns/'.self::segment($id);
    }
}
