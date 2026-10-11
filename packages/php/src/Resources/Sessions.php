<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\SessionModels;

/**
 * @phpstan-import-type Session from SessionModels
 * @phpstan-import-type PlatformSession from SessionModels
 * @phpstan-import-type ConfigurationPatch from SessionModels
 * @phpstan-import-type Account from SessionModels
 * @phpstan-import-type OperationAccepted from SessionModels
 */
final class Sessions extends Resource
{
    /**
 *
 * @return ApiResponse<array{data:list<PlatformSession>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{data:list<PlatformSession>}> */
        return $this->request('GET', '/platform/sessions', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:Session}> */
    public function retrieve(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:Session}> */
        return $this->request('GET', '/platform/sessions/' . self::segment($session), options: $options);
    }
    /**
 * @param array{configuration:ConfigurationPatch,revision:int} $body
 *
 * @return ApiResponse<array{success:bool,data:Session}> */
    public function update(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:Session}> */
        return $this->request('PUT', '/platform/sessions/' . self::segment($session), $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<array{data:array{removed:true,sessionId:string}}> */
    public function delete(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{data:array{removed:true,sessionId:string}}> */
        return $this->request('DELETE', '/platform/sessions/' . self::segment($session), options: $options);
    }
    /**
 *
 * @return ApiResponse<array{data:array{starting:true,sessionId:string}}> */
    public function start(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{data:array{starting:true,sessionId:string}}> */
        return $this->request('POST', '/platform/sessions/' . self::segment($session) . '/start', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{data:array{stopping:true,sessionId:string}}> */
    public function stop(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{data:array{stopping:true,sessionId:string}}> */
        return $this->request('POST', '/platform/sessions/' . self::segment($session) . '/stop', options: $options);
    }
    /**
 *
 * @return ApiResponse<OperationAccepted> */
    public function restart(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<OperationAccepted> */
        return $this->request('POST', '/platform/sessions/' . self::segment($session) . '/restart', options: $options);
    }
    /**
 *
 * @return ApiResponse<OperationAccepted> */
    public function logout(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<OperationAccepted> */
        return $this->request('POST', '/platform/sessions/' . self::segment($session) . '/logout', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:Account}> */
    public function account(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:Account}> */
        return $this->request('GET', '/platform/sessions/' . self::segment($session) . '/me', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:array{qr?:string,event?:string}}> */
    public function qr(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{qr?:string,event?:string}}> */
        return $this->request('GET', '/messaging/' . self::segment($session) . '/pair/qr', query: ['format' => 'json'], options: $options);
    }
    /**
 * @param array{phone:string} $body
 *
 * @return ApiResponse<array{success:bool,data:array{code:string}}> */
    public function requestPairingCode(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{code:string}}> */
        return $this->request('POST', '/messaging/' . self::segment($session) . '/pair/code', $body, options: $options);
    }
    /**
 * @param array<string,mixed> $params
 *
 * @return ApiResponse<array<string,mixed>> */
    public function getMetaPricing(string $session, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', '/messaging/' . self::segment($session) . '/meta-pricing', query: $params, options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function getCloudCredentialHealth(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', '/messaging/' . self::segment($session) . '/cloud-credentials', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function reauthorizeCloudCredentials(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('POST', '/messaging/' . self::segment($session) . '/cloud-credentials/reauthorize', options: ($options ?? new RequestOptions())->withoutRetries());
    }
}
