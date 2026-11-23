<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,Models,RequestOptions};

/** @phpstan-import-type Presence from Models as PresenceData
 * @phpstan-import-type ChatPresence from Models
 * @phpstan-import-type Success from Models */
final class Presence extends Resource
{
    /** @return ApiResponse<array{success:bool,data:PresenceData}> */
    public function get(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:PresenceData}> */
        return $this->request('GET', $this->path($connection), options:$options);
    }
    /** @param array{presence:'available'|'unavailable'} $body
     * @return ApiResponse<Success|array{success:bool,data:array{status:'OK'}|array{requestId:string}}> */
    public function set(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success|array{success:bool,data:array{status:'OK'}|array{requestId:string}}> */
        return $this->request('POST', $this->path($connection), $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ChatPresence}> */
    public function getForChat(string $connection, string $chatId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ChatPresence}> */
        return $this->request('GET', $this->path($connection).'/'.self::segment($chatId), options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:array{status:'SUBSCRIBED',expiresAt:string}|array{requestId:string}}> */
    public function subscribe(string $connection, string $chatId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:'SUBSCRIBED',expiresAt:string}|array{requestId:string}}> */
        return $this->request('POST', $this->path($connection).'/'.self::segment($chatId).'/subscribe', options:$options);
    }
    private function path(string $connection): string
    {
        return '/messaging/'.self::segment($connection).'/presence';
    }
}
