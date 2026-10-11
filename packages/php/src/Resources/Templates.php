<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,TemplateModels,Models};

/**
 * @phpstan-import-type ProjectTemplate from TemplateModels
 * @phpstan-import-type ProjectCreate from TemplateModels
 * @phpstan-import-type ProjectUpdate from TemplateModels
 * @phpstan-import-type Success from Models
 */
final class Templates extends Resource
{
    /** @return ApiResponse<array{success:true,data:list<ProjectTemplate>}> */
    public function list(string $projectSlug, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:list<ProjectTemplate>}> */ return $this->request('GET', $this->path($projectSlug), options:$options);
    }
    /** @param ProjectCreate $body
     * @return ApiResponse<array{success:true,data:ProjectTemplate}> */
    public function create(string $projectSlug, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:ProjectTemplate}> */ return $this->request('POST', $this->path($projectSlug), $body, options:$options);
    }
    /** @return ApiResponse<array{success:true,data:ProjectTemplate}> */
    public function retrieve(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:ProjectTemplate}> */ return $this->request('GET', $this->path($projectSlug, $id), options:$options);
    }
    /** @param ProjectUpdate $body
     * @return ApiResponse<array{success:true,data:ProjectTemplate}> */
    public function update(string $projectSlug, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:ProjectTemplate}> */ return $this->request('PATCH', $this->path($projectSlug, $id), $body, options:$options);
    }
    /** @return ApiResponse<Success> */
    public function delete(string $projectSlug, string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<Success> */ return $this->request('DELETE', $this->path($projectSlug, $id), options:$options);
    }
    /** @param array{values?:array<string,string>,surface?:'cloud'|'whatsmeow'|'sandbox'} $body
     * @return ApiResponse<array{success:true,data:array<string,mixed>}> */
    public function preview(string $projectSlug, string $id, array $body = [], ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:array<string,mixed>}> */ return $this->request('POST', $this->path($projectSlug, $id).'/preview', $body === [] ? new \stdClass() : $body, options:$options);
    }
    /** @param array{session:string} $body
     * @return ApiResponse<array{success:true,data:array<string,mixed>}> */
    public function submit(string $projectSlug, string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:true,data:array<string,mixed>}> */ return $this->request('POST', $this->path($projectSlug, $id).'/submit', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    private function path(string $projectSlug, ?string $id = null): string
    {
        return '/messaging/projects/'.self::segment($projectSlug).'/templates'.($id === null ? '' : '/'.self::segment($id));
    }
}
