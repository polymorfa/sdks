<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\ClientInterface;

final readonly class SystemClient
{
    private HttpTransport $transport;
    public function __construct(string $baseUrl = 'https://api.polymorfa.com', string $apiVersion = HttpTransport::API_VERSION, float $timeout = 30, int $maxNetworkRetries = 2, ?string $proxy = null, ?ClientInterface $http = null)
    {
        $this->transport = new HttpTransport(null, $baseUrl, $apiVersion, $timeout, $maxNetworkRetries, $proxy, $http);
    }
    /** @return ApiResponse<array{status:string,uptime:string,version:string,env:string}> */
    public function status(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{status:string,uptime:string,version:string,env:string}> */ return $this->transport->request('GET', '/messaging/info/status', options:$options);
    }
    /** @return ApiResponse<array{version:string,buildTime:string,env:string,apiVersion:string,minSupportedVersion:string}> */
    public function version(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{version:string,buildTime:string,env:string,apiVersion:string,minSupportedVersion:string}> */ return $this->transport->request('GET', '/messaging/info/version', options:$options);
    }
    /** @return ApiResponse<array{status:string,checks:array<string,array{status:string,error?:string}>}> */
    public function health(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{status:string,checks:array<string,array{status:string,error?:string}>}> */ return $this->transport->request('GET', '/health', options:$options);
    }
    /** @return ApiResponse<array{status:string}> */
    public function ping(?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<array{status:string}> */ return $this->transport->request('GET', '/ping', options:$options);
    }
}
