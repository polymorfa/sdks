<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\ApiResponse;
use Polymorfa\RequestOptions;
use Polymorfa\ConnectionModels;
use Polymorfa\CloudModels;

/**
 * @phpstan-import-type Connection from ConnectionModels
 * @phpstan-import-type PlatformConnection from ConnectionModels
 * @phpstan-import-type ConfigurationPatch from ConnectionModels
 * @phpstan-import-type Account from ConnectionModels
 * @phpstan-import-type OperationAccepted from ConnectionModels
 * @phpstan-import-type PricingParams from CloudModels
 * @phpstan-import-type PricingSummary from CloudModels
 * @phpstan-import-type CredentialHealth from CloudModels
 * @phpstan-import-type Reauthorization from CloudModels
 */
final class Connections extends Resource
{
    /**
 *
 * @return ApiResponse<array{data:list<PlatformConnection>}> */
    public function list(?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{data:list<PlatformConnection>}> */
        return $this->request('GET', '/platform/connections', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:Connection}> */
    public function retrieve(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:Connection}> */
        return \Polymorfa\ExistingContract::request($this->transport, 'GET', '/platform/connections/' . self::segment($connection), options: $options, model:'connection', messaging:true);
    }
    /**
 * @param array{configuration:ConfigurationPatch,revision:int} $body
 *
 * @return ApiResponse<array{success:bool,data:Connection}> */
    public function update(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        $options = \Polymorfa\ExistingContract::options($options, \Polymorfa\ConnectionDeliveryValidation::configuration($body));
        /** @var ApiResponse<array{success:bool,data:Connection}> */
        return \Polymorfa\ExistingContract::request($this->transport, 'PUT', '/platform/connections/' . self::segment($connection), $body, options: $options, model:'connection', messaging:true);
    }
    /**
 *
 * @return ApiResponse<array{data:array{removed:true,connectionId:string}}> */
    public function delete(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{data:array{removed:true,connectionId:string}}> */
        return $this->request('DELETE', '/platform/connections/' . self::segment($connection), options: $options);
    }
    /**
 *
 * @return ApiResponse<array{data:array{starting:true,connectionId:string}}> */
    public function start(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{data:array{starting:true,connectionId:string}}> */
        return $this->request('POST', '/platform/connections/' . self::segment($connection) . '/start', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{data:array{stopping:true,connectionId:string}}> */
    public function stop(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{data:array{stopping:true,connectionId:string}}> */
        return $this->request('POST', '/platform/connections/' . self::segment($connection) . '/stop', options: $options);
    }
    /**
 *
 * @return ApiResponse<OperationAccepted> */
    public function restart(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<OperationAccepted> */
        return $this->request('POST', '/platform/connections/' . self::segment($connection) . '/restart', options: $options);
    }
    /**
 *
 * @return ApiResponse<OperationAccepted> */
    public function logout(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<OperationAccepted> */
        return $this->request('POST', '/platform/connections/' . self::segment($connection) . '/logout', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:Account}> */
    public function account(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:Account}> */
        return $this->request('GET', '/platform/connections/' . self::segment($connection) . '/me', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:array{qr?:string,event?:string}}> */
    public function qr(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{qr?:string,event?:string}}> */
        return $this->request('GET', '/messaging/' . self::segment($connection) . '/pair/qr', query: ['format' => 'json'], options: $options);
    }
    /**
 * @param array{phone:string} $body
 *
 * @return ApiResponse<array{success:bool,data:array{code:string}}> */
    public function requestPairingCode(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{code:string}}> */
        return $this->request('POST', '/messaging/' . self::segment($connection) . '/pair/code', $body, options: $options);
    }
    /**
 * @param PricingParams $params
 *
 * @return ApiResponse<array{success:bool,data:PricingSummary}> */
    public function getMetaPricing(string $connection, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:PricingSummary}> */
        return $this->request('GET', '/messaging/' . self::segment($connection) . '/meta-pricing', query: $params, options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:CredentialHealth}> */
    public function getCloudCredentialHealth(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:CredentialHealth}> */
        return $this->request('GET', '/messaging/' . self::segment($connection) . '/cloud-credentials', options: $options);
    }
    /**
 *
 * @return ApiResponse<array{success:bool,data:Reauthorization}> */
    public function reauthorizeCloudCredentials(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:bool,data:Reauthorization}> */
        return $this->request('POST', '/messaging/' . self::segment($connection) . '/cloud-credentials/reauthorize', options: ($options ?? new RequestOptions())->withoutRetries());
    }
}
