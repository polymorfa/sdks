<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\ClientInterface;
use Polymorfa\Resources\Events;
use Polymorfa\Resources\Projects;
use Polymorfa\Resources\PlatformSessions;
use Polymorfa\Resources\PlatformWebhooks;

final readonly class Client
{
    private HttpTransport $transport;
    public PlatformSessions $sessions;
    public Projects $projects;
    public Events $events;
    public PlatformWebhooks $webhooks;
    public RawClient $raw;
    public function __construct(
        private Credential $credential,
        string $baseUrl = 'https://api.polymorfa.com',
        string $apiVersion = HttpTransport::API_VERSION,
        float $timeout = 30,
        int $maxNetworkRetries = 2,
        ?string $proxy = null,
        ?ClientInterface $http = null
    ) {
        if ($credential->kind !== 'organization_api_key') {
            throw new ConfigurationException('credential');
        }
        $this->transport = new HttpTransport($credential, $baseUrl, $apiVersion, $timeout, $maxNetworkRetries, $proxy, $http);
        $this->sessions = new PlatformSessions($this->transport);
        $this->projects = new Projects($this->transport);
        $this->events = new Events($this->transport, '/platform');
        $this->webhooks = new PlatformWebhooks($this->transport, '/platform');
        $this->raw = new RawClient($this->transport);
    }
    public function project(string $projectId): ProjectClient
    {
        return new ProjectClient($this->credential, $projectId, transport: $this->transport);
    }
}
