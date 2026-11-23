<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use Polymorfa\{ApiResponse, Models, RequestOptions};

/**
 * @phpstan-import-type Success from Models
 * @phpstan-type Participant array{id:string,isAdmin:bool,isSuperAdmin:bool,phoneNumber?:string,bsuid?:string,username?:string}
 * @phpstan-type Group array{id:string,name:string,description:string,createdAt:int,participants:list<Participant>,ownerId:string}
 * @phpstan-type InviteInfo array{id:string,subject:string,createdAt:int,size:int,participants:list<Participant>,creatorId:string}
 * @phpstan-type Capabilities array{status:'synced'|'unknown',syncedAt:?string,checkedAt:?string,capabilities:list<array{key:'polls.endTime'|'polls.hideVoters'|'polls.creatorEdit',kind:'feature',unit:null,value:?bool,source:'server'|'client_default'|null}>}
 */
final class Groups extends Resource
{
    /** @return ApiResponse<array{success:bool,data:list<Group>}> */
    public function list(string $connection, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<Group>}> */
        return $this->request('GET', $this->path($connection), options:$options);
    }
    /** @param array{name:string,participants:list<string>} $body
     * @return ApiResponse<array{success:bool,data:Group}> */
    public function create(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Group}> */
        return $this->request('POST', $this->path($connection), $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:InviteInfo}> */
    public function getJoinInfo(string $connection, string $code, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:InviteInfo}> */
        return $this->request('GET', $this->path($connection).'/join-info', query:['code' => $code], options:$options);
    }
    /** @param array{code:string} $body
     * @return ApiResponse<Success> */
    public function join(string $connection, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($connection).'/join', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:Group}> */
    public function retrieve(string $connection, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Group}> */
        return $this->request('GET', $this->path($connection, $groupId), options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:Capabilities}> */
    public function getCapabilities(string $connection, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Capabilities}> */
        return \Polymorfa\ExistingContract::request($this->transport, 'GET', $this->path($connection, $groupId).'/capabilities', options:$options, model:'groupCapabilities', messaging:true);
    }
    /** @return ApiResponse<Success> */
    public function delete(string $connection, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', $this->path($connection, $groupId), options:$options);
    }
    /** @return ApiResponse<Success> */
    public function leave(string $connection, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($connection, $groupId).'/leave', options:$options);
    }
    /** @param array{value:string} $body
     * @return ApiResponse<Success> */
    public function setSubject(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection, $groupId).'/subject', $body, options:$options);
    }
    /** @param array{value:string} $body
     * @return ApiResponse<Success> */
    public function setDescription(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection, $groupId).'/description', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:array{code:string}}> */
    public function getInviteCode(string $connection, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{code:string}}> */
        return $this->request('GET', $this->path($connection, $groupId).'/invite-code', options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:array{code:string}}> */
    public function revokeInviteCode(string $connection, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{code:string}}> */
        return $this->request('POST', $this->path($connection, $groupId).'/invite-code/revoke', options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:list<Participant>}> */
    public function listParticipants(string $connection, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<Participant>}> */
        return $this->request('GET', $this->path($connection, $groupId).'/participants', options:$options);
    }
    /** @param array{participants:list<string>} $body
     * @return ApiResponse<Success> */
    public function addParticipants(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($connection, $groupId).'/participants/add', $body, options:$options);
    }
    /** @param array{participants:list<string>} $body
     * @return ApiResponse<Success> */
    public function removeParticipants(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($connection, $groupId).'/participants/remove', $body, options:$options);
    }
    /** @param array{participants:list<string>} $body
     * @return ApiResponse<Success> */
    public function promoteParticipants(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($connection, $groupId).'/admin/promote', $body, options:$options);
    }
    /** @param array{participants:list<string>} $body
     * @return ApiResponse<Success> */
    public function demoteParticipants(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($connection, $groupId).'/admin/demote', $body, options:$options);
    }
    /** @param array{url?:string,base64?:string} $body
     * @return ApiResponse<Success> */
    public function setPicture(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection, $groupId).'/picture', $body, options:$options);
    }
    /** @param array{adminsOnly:bool} $body
     * @return ApiResponse<Success> */
    public function setInfoEditing(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection, $groupId).'/settings/info-edit', $body, options:$options);
    }
    /** @param array{adminsOnly:bool} $body
     * @return ApiResponse<Success> */
    public function setMessaging(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection, $groupId).'/settings/messages', $body, options:$options);
    }
    /** @param array{mode:'admin_add'|'all_member_add'} $body
     * @return ApiResponse<Success> */
    public function setMemberAddMode(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection, $groupId).'/settings/member-add', $body, options:$options);
    }
    /** @param array{required:bool} $body
     * @return ApiResponse<Success> */
    public function setJoinApproval(string $connection, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($connection, $groupId).'/settings/join-approval', $body, options:$options);
    }
    private function path(string $connection, ?string $groupId = null): string
    {
        return '/messaging/'.self::segment($connection).'/groups'.($groupId === null ? '' : '/'.self::segment($groupId));
    }
}
