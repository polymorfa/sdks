<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,OnboardingModels};

/**
 * @phpstan-import-type Scope from OnboardingModels
 * @phpstan-import-type RoutingPolicy from OnboardingModels
 * @phpstan-import-type SetPolicy from OnboardingModels
 * @phpstan-import-type LinkState from OnboardingModels
 */
final class HybridLink extends Resource
{
    /** @param Scope $scope
     * @return ApiResponse<array{success:true,data:RoutingPolicy}> */
    public function getPolicy(array $scope, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:RoutingPolicy}> */ return $this->request('GET', '/messaging/routing/hybrid', query:$scope, options:$options);
    }
    /** @param Scope $scope
     * @param SetPolicy $body
     * @return ApiResponse<array{success:true,data:RoutingPolicy}> */
    public function setPolicy(array $scope, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:RoutingPolicy}> */ return $this->request('PUT', '/messaging/routing/hybrid', $body, query:$scope, options:$options);
    }
    /** @return ApiResponse<array{success:true,data:LinkState}> */
    public function state(string $session, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:LinkState}> */ return $this->request('GET', '/messaging/'.self::segment($session).'/hybrid-link', options:$options);
    }
    /** @param array{expectedRevision:string,paused:bool} $body
     * @return ApiResponse<array{success:true,data:array{revision:string,paused:bool}}> */
    public function setPaused(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{revision:string,paused:bool}}> */ return $this->request('PUT', '/messaging/'.self::segment($session).'/hybrid-link', $body, options:$options);
    }
}
