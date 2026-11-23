<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, Models, RequestOptions};

/** @phpstan-import-type Profile from Models as ProfileData
 * @phpstan-import-type Success from Models */
final class Profile extends Resource
{
    /**
 * @return ApiResponse<array{success:bool,data:ProfileData}> */
    public function get(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ProfileData}> */
        return $this->request('GET', $this->path($connection), options:$options);
    }
    /** @param array{name:string} $body
 * @return ApiResponse<Success> */
    public function setName(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection).'/name', $body, options:$options);
    }
    /** @param array{status:string} $body
 * @return ApiResponse<Success> */
    public function setStatus(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection).'/status', $body, options:$options);
    }
    /** @param array{url?:string,base64?:string} $body
 * @return ApiResponse<Success> */
    public function setPicture(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection).'/picture', $body, options:$options);
    }
    /**
 * @return ApiResponse<Success> */
    public function deletePicture(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', $this->path($connection).'/picture', options:$options);
    }
    private function path(string $connection): string
    {
        return '/messaging/'.self::segment($connection).'/profile';
    }
}
