<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse,RequestOptions,OfficialGroupModels};

/**
 * @phpstan-import-type GroupList from OfficialGroupModels
 * @phpstan-import-type Group from OfficialGroupModels
 * @phpstan-import-type CreateInput from OfficialGroupModels
 * @phpstan-import-type UpdateInput from OfficialGroupModels
 * @phpstan-import-type JoinRequests from OfficialGroupModels
 * @phpstan-import-type Decision from OfficialGroupModels
 * @phpstan-import-type PinInput from OfficialGroupModels
 */
final class OfficialGroups extends Resource
{
    /** Send actual JPEG bytes once. The API checks square dimensions >=192px.
     * @return ApiResponse<array{success:true,data:array{accepted:true}}> */
    public function setPicture(string $session, string $group, #[\SensitiveParameter] string $jpeg, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        if (!str_starts_with($jpeg, "\xff\xd8\xff") || strlen($jpeg) > 5 * 1024 * 1024) { throw new \Polymorfa\ValidationException('Provide JPEG bytes up to 5 MiB.'); }
        $boundary = 'polymorfa-'.bin2hex(random_bytes(24));
        $bytes = '--'.$boundary."\r\nContent-Disposition: form-data; name=\"file\"; filename=\"picture.jpg\"\r\nContent-Type: image/jpeg\r\n\r\n".$jpeg."\r\n--".$boundary."--\r\n";
        $body = new \Polymorfa\BinaryRequestBody(static fn (?\Polymorfa\CancellationToken $cancel) => \GuzzleHttp\Psr7\Utils::streamFor($bytes), strlen($bytes), 'multipart/form-data; boundary='.$boundary);
        /** @var ApiResponse<array{success:true,data:array{accepted:true}}> */
        return $this->request('PUT', $this->path($session, $group).'/picture', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param array{limit?:int,before?:string,after?:string} $params
     * @return ApiResponse<array{success:true,data:GroupList}> */
    public function list(string $session, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:GroupList}> */ return $this->request('GET', $this->path($session), query:$params, options:$options);
    }
    /** @param CreateInput $body
     * @return ApiResponse<array{success:true,data:array{requestId:string}}> */
    public function create(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{requestId:string}}> */ return $this->request('POST', $this->path($session), $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @return ApiResponse<array{success:true,data:Group}> */
    public function retrieve(string $session, string $group, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:Group}> */ return $this->request('GET', $this->path($session, $group), options:$options);
    }
    /** @param UpdateInput $body
     * @return ApiResponse<array{success:true,data:array{accepted:true}}> */
    public function update(string $session, string $group, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{accepted:true}}> */ return $this->request('PATCH', $this->path($session, $group), $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @return ApiResponse<array{success:true,data:array{accepted:true}}> */
    public function delete(string $session, string $group, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{accepted:true}}> */ return $this->request('DELETE', $this->path($session, $group), options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @return ApiResponse<array{success:true,data:array{inviteLink:string}}> */
    public function getInviteLink(string $session, string $group, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{inviteLink:string}}> */ return $this->request('GET', $this->path($session, $group).'/invite-link', options:$options);
    }
    /** @return ApiResponse<array{success:true,data:array{inviteLink:string}}> */
    public function resetInviteLink(string $session, string $group, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{inviteLink:string}}> */ return $this->request('POST', $this->path($session, $group).'/invite-link/reset', options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param list<string> $participants
     * @return ApiResponse<array{success:true,data:array{accepted:true}}> */
    public function removeParticipants(string $session, string $group, array $participants, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{accepted:true}}> */ return $this->request('POST', $this->path($session, $group).'/participants/remove', ['participants' => $participants], options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param array{before?:string,after?:string} $params
     * @return ApiResponse<array{success:true,data:JoinRequests}> */
    public function listJoinRequests(string $session, string $group, array $params = [], ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:JoinRequests}> */ return $this->request('GET', $this->path($session, $group).'/join-requests', query:$params, options:$options);
    }
    /** @param list<string> $joinRequestIds
     * @return ApiResponse<array{success:true,data:Decision}> */
    public function approveJoinRequests(string $session, string $group, array $joinRequestIds, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:Decision}> */ return $this->request('POST', $this->path($session, $group).'/join-requests/approve', ['joinRequestIds' => $joinRequestIds], options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param list<string> $joinRequestIds
     * @return ApiResponse<array{success:true,data:Decision}> */
    public function rejectJoinRequests(string $session, string $group, array $joinRequestIds, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:Decision}> */ return $this->request('POST', $this->path($session, $group).'/join-requests/reject', ['joinRequestIds' => $joinRequestIds], options:($options ?? new RequestOptions())->withoutRetries());
    }
    /** @param PinInput $body
     * @return ApiResponse<array{success:true,data:array{accepted:true}}> */
    public function pin(string $session, string $group, array $body, ?RequestOptions $options = null): ApiResponse
    {
        $this->server();
        /** @var ApiResponse<array{success:true,data:array{accepted:true}}> */ return $this->request('POST', $this->path($session, $group).'/pins', $body, options:($options ?? new RequestOptions())->withoutRetries());
    }
    private function path(string $session, ?string $group = null): string
    {
        return '/messaging/'.self::segment($session).'/official-groups'.($group === null ? '' : '/'.self::segment($group));
    }
}
