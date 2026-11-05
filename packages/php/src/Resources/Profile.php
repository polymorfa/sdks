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
    public function get(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ProfileData}> */
        return $this->request('GET', $this->path($session), options:$options);
    }
    /** @param array{name:string} $body
 * @return ApiResponse<Success> */
    public function setName(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session).'/name', $body, options:$options);
    }
    /** @param array{status:string} $body
 * @return ApiResponse<Success> */
    public function setStatus(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session).'/status', $body, options:$options);
    }
    /** @param array{url?:string,base64?:string} $body
 * @return ApiResponse<Success> */
    public function setPicture(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session).'/picture', $body, options:$options);
    }
    /**
 * @return ApiResponse<Success> */
    public function deletePicture(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', $this->path($session).'/picture', options:$options);
    }
    private function path(string $session): string
    {
        return '/messaging/'.self::segment($session).'/profile';
    }
}
