<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions};

final class Calls extends Resource
{
    /** @param array{from:string} $body
     * @return ApiResponse<array{success:bool,message?:string}|array{success:true,data:array{status:'REJECTED'}|array{requestId:string}}>
     */
    public function reject(string $connection, string $callId, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,message?:string}|array{success:true,data:array{status:'REJECTED'}|array{requestId:string}}> */ return $this->request('POST', '/messaging/'.self::segment($connection).'/calls/'.self::segment($callId).'/reject', $body, options:$options);
    }
}
