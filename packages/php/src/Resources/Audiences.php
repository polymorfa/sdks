<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,AudienceModels,CampaignModels};

/**
 * @phpstan-import-type CreateInput from AudienceModels
 * @phpstan-import-type ImportResult from AudienceModels
 * @phpstan-import-type Member from AudienceModels
 * @phpstan-import-type Added from AudienceModels
 * @phpstan-import-type RecipientInput from CampaignModels
 * @phpstan-import-type RetargetInput from \Polymorfa\CampaignContractModels
 * @phpstan-import-type RetargetResult from \Polymorfa\CampaignContractModels
 */
final class Audiences extends Resource
{
    /** @param RetargetInput $body
     * @return \Polymorfa\ApiResponse<array{data:RetargetResult}> */
    public function createFromCampaign(array $body, ?\Polymorfa\RequestOptions $options = null): \Polymorfa\ApiResponse
    {
        \Polymorfa\CampaignContractValidation::retarget($body);
        /** @var \Polymorfa\ApiResponse<array{data:RetargetResult}> */
        return \Polymorfa\CampaignContract::request($this->transport, 'POST', '/platform/audiences/from-campaign', [], \Polymorfa\CampaignContract::body($body), $options, 'retarget', false, false, true);
    }


    /** @return ApiResponse<array{data:array<string,mixed>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('GET', '/platform/audiences', options:$options);
    }
    /** @param CreateInput $body
     * @return ApiResponse<array{data:ImportResult}> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:ImportResult}> */ return $this->request('POST', '/platform/audiences', \Polymorfa\ExistingContract::body($body), options:\Polymorfa\ExistingContract::options($options));
    }
    /** @param array{members:list<RecipientInput>} $body
     * @return ApiResponse<array{data:Added}> */
    public function addMembers(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:Added}> */ return $this->request('POST', $this->path($id).'/members', \Polymorfa\ExistingContract::body($body), options:\Polymorfa\ExistingContract::options($options)->withoutAutomaticRetry());
    }
    /** @param array{cursor?:string,limit?:int} $params
     * @return ApiResponse<array{data:list<Member>,page:array{nextCursor:?string,hasMore:bool}}> */
    public function listMembers(string $id, array $params = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:list<Member>,page:array{nextCursor:?string,hasMore:bool}}> */ return $this->request('GET', $this->path($id).'/members', query:$params, options:$options);
    }
    /** @return ApiResponse<array{data:array{removed:true,listId:string,phone:string,recipientCount:int}}> */
    public function deleteMember(string $id, string $phone, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array{removed:true,listId:string,phone:string,recipientCount:int}}> */ return $this->request('DELETE', $this->path($id).'/members/'.self::segment($phone), options:$options);
    }
    /** @return ApiResponse<array{data:array<string,mixed>}> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('GET', $this->path($id), options:$options);
    }
    /** @return ApiResponse<array{data:array<string,mixed>}> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('DELETE', $this->path($id), options:$options);
    }
    /** @param array<string,mixed>|null $body
     * @return ApiResponse<array{data:array<string,mixed>}> */
    public function createUpload(?array $body = null, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('POST', '/platform/audiences/uploads', $body === [] ? new \stdClass() : $body, options:$options);
    }
    private function path(string $id): string
    {
        return '/platform/audiences/'.self::segment($id);
    }
}
