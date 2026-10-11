<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,ConfigurationException,HttpTransport,NotFoundException,RequestOptions,SipModels};

/**
 * @phpstan-import-type Trunk from SipModels
 * @phpstan-import-type Credentials from SipModels
 * @phpstan-import-type Created from SipModels
 * @phpstan-import-type Endpoint from SipModels
 * @phpstan-import-type CreateInput from SipModels
 * @phpstan-import-type UpdateInput from SipModels
 */
final class SipTrunks extends PlatformResource
{
    public function __construct(HttpTransport $transport, private readonly ?string $projectId = null, private readonly bool $confineById = false)
    {
        parent::__construct($transport, '/platform');
    }
    /** Team clients supply projectId; project views use their own project.
     * @return ApiResponse<list<Trunk>> */
    public function list(?string $projectId = null, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<list<Trunk>> */return $this->unwrapped('GET', '/platform/sip-trunks', query:['projectId' => $this->project($projectId)], options:$options);
    }
    /** @return ApiResponse<Endpoint> */
    public function endpoint(?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<Endpoint> */return $this->unwrapped('GET', '/platform/sip/endpoint', options:$options);
    }
    /** @param CreateInput $input
     * @return ApiResponse<Created> */
    public function create(array $input, ?string $projectId = null, ?RequestOptions $options = null): ApiResponse
    {/** @var ApiResponse<Created> */return $this->unwrapped('POST', '/platform/sip-trunks', array_replace($input, ['projectId' => $this->project($projectId)]), options:$options);
    }
    /** @return ApiResponse<Trunk> */
    public function retrieve(string $id, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Trunk> $response */$response = $this->unwrapped('GET', self::path($id), options:$options);
        $this->assertProject($id, $response->data['projectId']);
        return $response;
    }
    /** @param UpdateInput $input
     * @return ApiResponse<Trunk> */
    public function update(string $id, array $input, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);/** @var ApiResponse<Trunk> */
        return $this->unwrapped('PATCH', self::path($id), (object)$input, options:$options);
    }
    /** @return ApiResponse<array{id:string,deleted:true}> */
    public function delete(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);/** @var ApiResponse<array{id:string,deleted:true}> */
        return $this->unwrapped('DELETE', self::path($id), options:$options);
    }
    /** @return ApiResponse<Credentials> */
    public function rotateCredentials(string $id, ?RequestOptions $options = null): ApiResponse
    {
        $this->confine($id, $options);/** @var ApiResponse<Credentials> */
        return $this->unwrapped('POST', self::path($id).'/credentials', options:$options);
    }
    private function project(?string $id): string
    {
        $id = $this->projectId ?? $id;
        if ($id === null || trim($id) === '') {
            throw new ConfigurationException('projectId');
        }return $id;
    }
    private static function path(string $id): string
    {
        if (trim($id) === '') {
            throw new ConfigurationException('trunkId');
        }return '/platform/sip-trunks/'.self::segment($id);
    }
    private function assertProject(string $id, string $project): void
    {
        if ($this->projectId !== null && strtolower($project) !== strtolower($this->projectId)) {
            throw new NotFoundException('SIP trunk not found.', 'resource_not_found', status:404, details:['trunkId' => $id]);
        }
    }
    private function confine(string $id, ?RequestOptions $options): void
    {
        if (!$this->confineById) {
            return;
        }$options ??= new RequestOptions();
        $read = new RequestOptions($options->timeout,$options->maxNetworkRetries,$options->apiVersion,null,$options->headers,$options->cancellation);
        $this->retrieve($id,$read);
    }
}
