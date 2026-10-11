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
    public Resources\RequestLogs $requestLogs;
    public Resources\Operations $operations;
    public Resources\WebhookDeliveries $webhookDeliveries;
    public PlatformWebhooks $webhooks;
    public RawClient $raw;
    public Resources\PlatformMedia $media;
    public Resources\QuickLinkSettings $quickLinkSettings;
    public Resources\SessionConfiguration $sessionConfiguration;
    public Resources\SipTrunks $sipTrunks;
    public Resources\Customers $customers;
    public Resources\Usage $usage;
    public Resources\Billing $billing;
    public Resources\AuditLogs $auditLogs;
    public Resources\SessionBans $sessionBans;
    public Resources\SecurityIncidents $securityIncidents;
    public Resources\OptOuts $optOuts;
    public Resources\Organizations $organizations;
    public Resources\Members $members;
    public Resources\ApiKeys $apiKeys;
    public Resources\ProjectTokens $projectTokens;
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
        $this->media = new Resources\PlatformMedia($this->transport);
        $this->requestLogs = new Resources\RequestLogs($this->transport);
        $this->quickLinkSettings = new Resources\QuickLinkSettings($this->transport);
        $this->sessionConfiguration = new Resources\SessionConfiguration($this->transport);
        $this->sipTrunks = new Resources\SipTrunks($this->transport);
        $this->customers = new Resources\Customers($this->transport);
        $this->usage = new Resources\Usage($this->transport);
        $this->billing = new Resources\Billing($this->transport);
        $this->auditLogs = new Resources\AuditLogs($this->transport);
        $this->sessionBans = new Resources\SessionBans($this->transport);
        $this->securityIncidents = new Resources\SecurityIncidents($this->transport);
        $this->optOuts = new Resources\OptOuts($this->transport);
        $this->organizations = new Resources\Organizations($this->transport);
        $this->members = new Resources\Members($this->transport);
        $this->apiKeys = new Resources\ApiKeys($this->transport);
        $this->projectTokens = new Resources\ProjectTokens($this->transport);
        $this->sessions = new PlatformSessions($this->transport);
        $this->projects = new Projects($this->transport);
        $this->events = new Events($this->transport, '/platform');
        $this->operations = new Resources\Operations($this->transport, '/platform');
        $this->webhookDeliveries = new Resources\WebhookDeliveries($this->transport, '/platform');
        $this->webhooks = new PlatformWebhooks($this->transport, '/platform');
        $this->raw = new RawClient($this->transport);
    }
    public function project(string $projectId): ProjectClient
    {
        return new ProjectClient($this->credential, $projectId, transport: $this->transport);
    }
}
