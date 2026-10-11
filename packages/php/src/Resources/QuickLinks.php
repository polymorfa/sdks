<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\ValidationException;

/** @phpstan-type Link array{id:string,url:string,session:string,purpose:string,connectionGoal:string,expiresAt:?string} */
final class QuickLinks extends Resource
{
    /**
 * @param array{purpose?:'initial'|'add_connection',session?:string,projectId?:string,customerId?:string,externalId?:string,configuration?:array<string,mixed>,billingControls?:array{limitCredits:?float,priority:int},connectionGoal?:string,addConnection?:string} $body
     *
 *
 * @return ApiResponse<array{success:bool,data:Link}> */
    public function create(array $body = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (($body['purpose'] ?? 'initial') === 'add_connection' && empty($body['session'])) {
            throw new ValidationException('An add_connection QuickLink requires session.');
        }
        if (isset($body['billingControls'])) {
            $limit = $body['billingControls']['limitCredits'];
            $priority = $body['billingControls']['priority'];
            if (($body['purpose'] ?? '') === 'add_connection' || isset($body['configuration']['testing'])
                || ($limit !== null && (!is_finite($limit) || $limit < 0 || $limit > 1000000 || abs($limit * 1000000 - round($limit * 1000000)) > 1e-6)) || $priority < 0 || $priority > 1000000) {
                throw new ValidationException('Invalid initial billing controls.');
            }
        }
        /** @var ApiResponse<array{success:bool,data:Link}> */
        return $this->request('POST', '/messaging/quicklinks', $body === [] ? new \stdClass() : $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function availability(string $projectId, string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', '/messaging/quicklinks/availability', query: ['projectId' => $projectId, 'session' => $session], options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:array{id:string,status:string,session:string,purpose:string,connectionGoal:string,expiresAt:?string,openedAt:?string,connectedAt:?string,phone:?string,errorCode:?string,hybridPhase:?string}}> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:array{id:string,status:string,session:string,purpose:string,connectionGoal:string,expiresAt:?string,openedAt:?string,connectedAt:?string,phone:?string,errorCode:?string,hybridPhase:?string}}> */
        return $this->request('GET', '/messaging/quicklinks/' . self::segment($id), options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,message:string}> */
    public function cancel(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,message:string}> */
        return $this->request('DELETE', '/messaging/quicklinks/' . self::segment($id), options: $options);
    }
}
