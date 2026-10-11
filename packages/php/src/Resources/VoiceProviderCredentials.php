<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,AuthorizationException,ConfigurationException,HttpTransport,NotFoundException,RequestOptions,VoiceModels};

/**
 * @phpstan-import-type ProviderCredential from VoiceModels
 * @phpstan-import-type CreateCredentialInput from VoiceModels
 * @phpstan-import-type Deleted from VoiceModels
 */
final class VoiceProviderCredentials extends PlatformResource
{
    private const PATH = '/platform/voice/provider-credentials';
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null, private readonly bool $confineById = false)
    {
        parent::__construct($transport, '/platform');
        $this->server();
    }
    /** @return ApiResponse<list<ProviderCredential>> */
    public function list(?string $projectId = null, ?RequestOptions $options = null): ApiResponse
    { /** @var ApiResponse<list<ProviderCredential>> */ return $this->unwrapped('GET', self::PATH, query:['projectId' => $this->projectId ?? $projectId], options:$options);
    }
    /** @param CreateCredentialInput $input
     * @return ApiResponse<ProviderCredential> */
    public function create(array $input, ?RequestOptions $options = null): ApiResponse
    {
        if ($input['apiKey'] === '') {
            throw new ConfigurationException('apiKey');
        }
        if ($this->projectId !== null) {
            $input['projectId'] = $this->projectId;
        }
        /** @var ApiResponse<ProviderCredential> */ return $this->unwrapped('POST', self::PATH, $input, options:$options);
    }
    /** @return ApiResponse<ProviderCredential> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<ProviderCredential> $r */ $r = $this->unwrapped('GET', self::path($id), options:$options);
        $this->assertVisible($r->data['projectId']);
        return $r;
    }
    /** @return ApiResponse<ProviderCredential> */
    public function verify(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);
        /** @var ApiResponse<ProviderCredential> */ return $this->unwrapped('POST', self::path($id).'/verify', options:$options);
    }
    /** @return ApiResponse<Deleted> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);
        /** @var ApiResponse<Deleted> */ return $this->unwrapped('DELETE', self::path($id), options:$options);
    }
    private static function path(string $id): string
    {
        if (trim($id) === '') {
            throw new ConfigurationException('credentialId');
        } return self::PATH.'/'.self::segment($id);
    }
    private function assertVisible(?string $project): void
    {
        if ($this->projectId !== null && $project !== null && strtolower($project) !== strtolower($this->projectId)) {
            throw new NotFoundException('Provider credential not found.', 'resource_not_found', status:404);
        }
    }
    private function confine(string $id, ?RequestOptions $options): void
    {
        if (!$this->confineById) {
            return;
        } $o = $options ?? new RequestOptions();
        $r = $this->retrieve($id, new RequestOptions($o->timeout, $o->maxNetworkRetries, $o->apiVersion, null, $o->headers, $o->cancellation));
        if ($r->data['projectId'] === null) {
            throw new AuthorizationException('Manage team-wide credentials from the organization client.','permission_denied',status:403);
        }
    }
}
