<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,TemplateModels,Models};

/**
 * @phpstan-import-type CloudTemplate from TemplateModels
 * @phpstan-import-type CloudCreate from TemplateModels
 * @phpstan-import-type Success from Models
 */
final class CloudTemplates extends Resource
{
    /** @return ApiResponse<array{success:true,data:list<CloudTemplate>}> */
    public function list(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:list<CloudTemplate>}> */ return $this->request('GET', $this->path($connection), options:$options);
    }
    /** @param array{language?:string} $params
     * @return ApiResponse<array{success:true,data:CloudTemplate}> */
    public function retrieve(string $connection, string $name, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:CloudTemplate}> */ return $this->request('GET', $this->path($connection, $name), query:$params, options:$options);
    }
    /** @param CloudCreate $body
     * @return ApiResponse<array{success:true,data:CloudTemplate}> */
    public function create(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:CloudTemplate}> */ return $this->request('POST', $this->path($connection), $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param array{components:list<mixed>} $body
     * @param array{language?:string} $params
     * @return ApiResponse<array{success:true,data:array{accepted:true,name:string,language:string}}> */
    public function update(string $connection, string $name, array $body, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{accepted:true,name:string,language:string}}> */ return $this->request('PATCH', $this->path($connection, $name), $body, query:$params, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @return ApiResponse<Success> */
    public function delete(string $connection, string $name, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<Success> */ return $this->request('DELETE', $this->path($connection, $name), options:($options ?? new RequestOptions())->withoutRetries());
    }
    private function path(string $connection, ?string $name = null): string
    {
        return '/messaging/'.self::segment($connection).'/templates'.($name === null ? '' : '/'.self::segment($name));
    }
}
