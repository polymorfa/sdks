<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;

final class Sessions extends Resource
{
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', '/platform/sessions', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function retrieve(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('GET', '/platform/sessions/' . self::segment($session), options: $options);
    }
    /**
 * @param array{configuration:array<string,mixed>,revision:int} $body
 *
 * @return ApiResponse<array<string,mixed>> */
    public function update(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('PUT', '/platform/sessions/' . self::segment($session), $body, options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function delete(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('DELETE', '/platform/sessions/' . self::segment($session), options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function start(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('POST', '/platform/sessions/' . self::segment($session) . '/start', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function stop(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('POST', '/platform/sessions/' . self::segment($session) . '/stop', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function restart(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('POST', '/platform/sessions/' . self::segment($session) . '/restart', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function logout(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        return $this->request('POST', '/platform/sessions/' . self::segment($session) . '/logout', options: $options);
    }
    /**
 *
 * @return ApiResponse<array<string,mixed>> */
    public function account(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
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
