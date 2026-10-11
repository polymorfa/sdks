<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;

/** @phpstan-type Webhook array{id:string,tenantId:string,url:string,events:list<string>,retries:array<string,mixed>,headers:list<array{name:string,value:string}>,enabled:bool,createdAt:string,session?:string,format?:string} */
final class Webhooks extends Resource
{
    /**
 *
 * @return ApiResponse<array{success:bool,data:list<Webhook>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,data:list<Webhook>}> */ return $this->request('GET', '/messaging/webhooks', options: $options);
    }
    /**
 * @param array{url:string,session?:string,events?:list<string>,hmacKey?:string,retries?:array<string,mixed>,headers?:list<array{name:string,value:string}>,format?:string} $body
 *
 * @return ApiResponse<array{success:bool,data:Webhook}> */
    public function create(array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,data:Webhook}> */ return $this->request('POST', '/messaging/webhooks', $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:Webhook}> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,data:Webhook}> */ return $this->request('GET', '/messaging/webhooks/' . self::segment($id), options: $options);
    }
    /**
 * @param array{url?:string,events?:list<string>,hmacKey?:string,enabled?:bool,retries?:array<string,mixed>,headers?:list<array{name:string,value:string}>,format?:string} $body
 *
 * @return ApiResponse<array{success:bool,data:Webhook}> */
    public function update(string $id, array $body, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,data:Webhook}> */ return $this->request('PUT', '/messaging/webhooks/' . self::segment($id), $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,message?:string}> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{success:bool,message?:string}> */ return $this->request('DELETE', '/messaging/webhooks/' . self::segment($id), options: $options);
    }
}
