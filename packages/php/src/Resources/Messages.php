<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\Models;
use Polymorfa\MessageModels;

/**
 * @phpstan-import-type Success from Models
 * @phpstan-import-type Conversation from MessageModels
 * @phpstan-import-type SendRequest from MessageModels as MessageRequest
 * @phpstan-import-type Receipt from MessageModels as MessageReceipt
 * @phpstan-import-type MessageResponse from MessageModels
 * @phpstan-import-type Operation from MessageModels
 */
final class Messages extends Resource
{
    /**
 * @param MessageRequest $body
 *
 * @return ApiResponse<array{success:true,data:MessageResponse}> */
    public function send(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        if (array_key_exists('requestPhoneNumber', $body['content'])) {
            $body['content']['requestPhoneNumber'] = new \stdClass();
        }
        /** @var ApiResponse<array{success:true,data:MessageResponse}> */
        return $this->request(
            'POST',
            '/messaging/' . self::segment($session) . '/messages/send',
            $body,
            options: ($options ?? new RequestOptions())->withIdempotencyKey()
        );
    }

    /**
 * @param array{conversation:Conversation,id:string,reaction:string,transport?:'auto'|'linked_devices'|'official_api'} $body
 *
 * @return ApiResponse<array{success:true,data:MessageReceipt}> */
    public function react(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:true,data:MessageReceipt}> */
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

    /** @return ApiResponse<array{success:true,data:Operation}> */
    public function operationStatus(string $session, string $operationId, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:Operation}> */
        return $this->request('GET', '/messaging/' . self::segment($session) . '/operations/' . self::segment($operationId), options: $options);
    }
}
