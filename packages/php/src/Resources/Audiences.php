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
 */
final class Audiences extends Resource
{
    /** @return ApiResponse<array{data:array<string,mixed>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:array<string,mixed>}> */ return $this->request('GET', '/platform/audiences', options:$options);
    }
    /** @param CreateInput $body
     * @return ApiResponse<array{data:ImportResult}> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:ImportResult}> */ return $this->request('POST', '/platform/audiences', $body, options:$options);
    }
    /** @param array{members:list<RecipientInput>} $body
     * @return ApiResponse<array{data:Added}> */
    public function addMembers(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{data:Added}> */ return $this->request('POST', $this->path($id).'/members', $body, options:($options ?? new RequestOptions())->withoutAutomaticRetry());
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
