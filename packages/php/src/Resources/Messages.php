<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\Models;

/**
 * @phpstan-import-type Success from Models
 * @phpstan-type Conversation array{id?:string,phoneNumber?:string,bsuid?:string,username?:string}
 * @phpstan-type MessageRequest array{conversation:Conversation,content:array<string,mixed>,transport?:string,replyTo?:string}
 * @phpstan-type Receipt array{success:bool,data:array{id:string,whatsapp_ids:array<string,string>,conversation:Conversation,timestamp:string,status:string,type?:string}}
 */
final class Messages extends Resource
{
    /**
 * @param MessageRequest $body
 *
 * @return ApiResponse<Receipt> */
    public function send(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Receipt> */
        return $this->request(
            'POST',
            '/messaging/' . self::segment($session) . '/messages/send',
            $body,
            options: ($options ?? new RequestOptions())->withIdempotencyKey()
        );
    }

    /**
 * @param array{conversation:Conversation,id:string,reaction:string,transport?:string} $body
 *
 * @return ApiResponse<Receipt> */
    public function react(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Receipt> */
        return $this->request(
            'POST',
            '/messaging/' . self::segment($session) . '/messages/react',
            $body,
            options: ($options ?? new RequestOptions())->withIdempotencyKey()
        );
    }

    /**
 * @param array{conversation:Conversation,id:string} $body
 *
 * @return ApiResponse<array{success:bool,data:array{status:string}}> */
    public function markSeen(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:string}}> */
        return $this->request('POST', '/messaging/' . self::segment($session) . '/messages/seen', $body, options: $options);
    }

    /**
 * @param array{conversation:Conversation,id?:string,state:'typing'|'recording'|'paused'} $body
 *
 * @return ApiResponse<array{success:bool,data:array{status:string}}> */
    public function setTyping(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:string}}> */
        return $this->request('POST', '/messaging/' . self::segment($session) . '/messages/typing', $body, options: $options);
    }

    /**
 * @param array{conversation:Conversation,id:string,star:bool} $body
 *
 * @return ApiResponse<array{success:bool,data:array{status:'OK'}}> */
    public function star(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{status:'OK'}}> */
        return $this->request('POST', '/messaging/' . self::segment($session) . '/messages/star', $body, options: $options);
    }

    /**
 *
 * @return ApiResponse<array{success:bool,data:array{operationId:string,status:string,transport?:string,rejectionCode?:string,receipt?:array<string,mixed>}}> */
    public function operationStatus(string $session, string $operationId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:array{operationId:string,status:string,transport?:string,rejectionCode?:string,receipt?:array<string,mixed>}}> */
        return $this->request('GET', '/messaging/' . self::segment($session) . '/operations/' . self::segment($operationId), options: $options);
    }
}
