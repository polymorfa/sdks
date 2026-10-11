<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\ClientInterface;
use Polymorfa\Resources\Events;
use Polymorfa\Resources\PlatformWebhooks;

final readonly class ProjectClient
{
    public Events $events;
    public PlatformWebhooks $webhooks;
    public RawClient $raw;
    public Resources\SipTrunks $sipTrunks;
    public Resources\Usage $usage;
    public string $projectId;
    public function __construct(
        Credential $credential,
        string $projectId,
        string $baseUrl = 'https://api.polymorfa.com',
        string $apiVersion = HttpTransport::API_VERSION,
        float $timeout = 30,
        int $maxNetworkRetries = 2,
        ?string $proxy = null,
        ?ClientInterface $http = null,
        ?HttpTransport $transport = null
    ) {
        if ($credential->kind === 'client_token' || trim($projectId) === '') {
            throw new ConfigurationException('projectId');
        }
        $transport ??= new HttpTransport($credential, $baseUrl, $apiVersion, $timeout, $maxNetworkRetries, $proxy, $http);
        $this->projectId = $projectId;
        $prefix = '/platform/projects/' . rawurlencode($projectId);
        $this->sipTrunks = new Resources\SipTrunks($transport, $projectId, $credential->kind === 'organization_api_key');
        $this->usage = new Resources\Usage($transport, $projectId);
        $this->events = new Events($transport, $prefix);
        $this->webhooks = new PlatformWebhooks($transport, $prefix);
        $this->raw = new RawClient($transport, $projectId);
    }
    public function project(string $projectId): self
    {
        if ($projectId !== $this->projectId) {
            throw new ConfigurationException('projectId');
        } return $this;
    }
}
