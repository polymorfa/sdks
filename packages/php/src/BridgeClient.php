<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\ClientInterface;

final readonly class BridgeClient
{
    public Resources\BridgeRoutes $routes;
    public function __construct(Credential $credential, string $baseUrl = 'https://api.polymorfa.com', string $apiVersion = HttpTransport::API_VERSION, float $timeout = 30, int $maxNetworkRetries = 2, ?string $proxy = null, ?ClientInterface $http = null)
    {
        if ($credential->kind !== 'project_token') {
            throw new ConfigurationException('credential');
        } $this->routes = new Resources\BridgeRoutes(new HttpTransport($credential, $baseUrl, $apiVersion, $timeout, $maxNetworkRetries, $proxy, $http));
    }
}
