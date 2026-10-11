<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,CampaignModels,ValidationException};

/**
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
 */
final class MessagingCampaigns extends Resource
{
    /** @return ApiResponse<array{success:true,data:list<Campaign>}> */
    public function list(string $projectSlug, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:list<Campaign>}> */ return $this->request('GET', $this->path($projectSlug), options:$options);
    }
    /** @param CreateInput $body
     * @return ApiResponse<array{success:true,data:Campaign}> */
    public function create(string $projectSlug, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:Campaign}> */ return $this->request('POST', $this->path($projectSlug), $body, options:($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @return ApiResponse<array{success:true,data:Campaign}> */
    public function retrieve(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:Campaign}> */ return $this->request('GET', $this->path($projectSlug, $id), options:$options);
    }
    /** @param UpdateInput $body
     * @return ApiResponse<array{success:true,data:Campaign}> */
    public function update(string $projectSlug, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    {
        if ($body === []) {
            throw new ValidationException('Supply at least one draft field.');
        } /** @var ApiResponse<array{success:true,data:Campaign}> */ return $this->request('PATCH', $this->path($projectSlug, $id), $body, options:($options ?? new RequestOptions())->withoutAutomaticRetry());
    }
    /** @return ApiResponse<array{success:true,data:Analytics}> */
    public function analytics(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:Analytics}> */ return $this->request('GET', $this->path($projectSlug, $id).'/analytics', options:$options);
    }
    /** @param array{scheduledAt?:int|float} $body
     * @return ApiResponse<array{success:true,data:CampaignOperation}> */
    public function launch(string $projectSlug, string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignOperation}> */ return $this->request('POST', $this->path($projectSlug, $id).'/launch', $body === [] ? new \stdClass() : $body, options:($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @param array{scheduledAt:int|float|null} $body
     * @return ApiResponse<array{success:true,data:CampaignOperation}> */
    public function reschedule(string $projectSlug, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignOperation}> */ return $this->request('POST', $this->path($projectSlug, $id).'/reschedule', $body, options:($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @return ApiResponse<array{success:true,data:CampaignOperation}> */
    public function pause(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignOperation}> */ return $this->request('POST', $this->path($projectSlug, $id).'/pause', options:($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @return ApiResponse<array{success:true,data:CampaignOperation}> */
    public function resume(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignOperation}> */ return $this->request('POST', $this->path($projectSlug, $id).'/resume', options:($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @return ApiResponse<array{success:true,data:CampaignStop}> */
    public function stop(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:CampaignStop}> */ return $this->request('POST', $this->path($projectSlug, $id).'/stop', options:($options ?? new RequestOptions())->withIdempotencyKey());
    }
    /** @param array{status?:Status,cursor?:string,limit?:int} $params
     * @return ApiResponse<array{success:true,data:list<Recipient>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listRecipients(string $projectSlug, string $id, array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:list<Recipient>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', $this->path($projectSlug, $id).'/recipients', query:$params, options:$options);
    }
    /** @param array{recipients:list<RecipientInput>} $body
     * @return ApiResponse<array{success:true,data:AddedRecipients}> */
    public function addRecipients(string $projectSlug, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:AddedRecipients}> */ return $this->request('POST', $this->path($projectSlug, $id).'/recipients', $body, options:($options ?? new RequestOptions())->withoutAutomaticRetry());
    }
    /** @param array{includeSkippedError?:bool} $body
     * @return ApiResponse<array{success:true,data:array{requeued:int}}> */
    public function requeue(string $projectSlug, string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:array{requeued:int}}> */ return $this->request('POST', $this->path($projectSlug, $id).'/requeue', $body === [] ? new \stdClass() : $body, options:$options);
    }
    private function path(string $projectSlug,?string $id = null): string
    {
        return '/messaging/projects/'.self::segment($projectSlug).'/campaigns'.($id === null ? '' : '/'.self::segment($id));
    }
}
