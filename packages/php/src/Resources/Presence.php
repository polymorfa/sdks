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
    public function get(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:PresenceData}> */
        return $this->request('GET', $this->path($session), options:$options);
    }
    /** @param array{presence:'available'|'unavailable'} $body
     * @return ApiResponse<Success|array{success:bool,data:array{status:'OK'}|array{requestId:string}}> */
    public function set(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success|array{success:bool,data:array{status:'OK'}|array{requestId:string}}> */
        return $this->request('POST', $this->path($session), $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:ChatPresence}> */
    public function getForChat(string $session, string $chatId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:ChatPresence}> */
        return $this->request('GET', $this->path($session).'/'.self::segment($chatId), options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:array{status:'SUBSCRIBED',expiresAt:string}|array{requestId:string}}> */
    public function subscribe(string $session, string $chatId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:'SUBSCRIBED',expiresAt:string}|array{requestId:string}}> */
        return $this->request('POST', $this->path($session).'/'.self::segment($chatId).'/subscribe', options:$options);
    }
    private function path(string $session): string
    {
        return '/messaging/'.self::segment($session).'/presence';
    }
}
