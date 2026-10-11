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
    public function list(string $session, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<Group>}> */
        return $this->request('GET', $this->path($session), options:$options);
    }
    /** @param array{name:string,participants:list<string>} $body
     * @return ApiResponse<array{success:bool,data:Group}> */
    public function create(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Group}> */
        return $this->request('POST', $this->path($session), $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:InviteInfo}> */
    public function getJoinInfo(string $session, string $code, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:InviteInfo}> */
        return $this->request('GET', $this->path($session).'/join-info', query:['code' => $code], options:$options);
    }
    /** @param array{code:string} $body
     * @return ApiResponse<Success> */
    public function join(string $session, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session).'/join', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:Group}> */
    public function retrieve(string $session, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Group}> */
        return $this->request('GET', $this->path($session, $groupId), options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:Capabilities}> */
    public function getCapabilities(string $session, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:Capabilities}> */
        return $this->request('GET', $this->path($session, $groupId).'/capabilities', options:$options);
    }
    /** @return ApiResponse<Success> */
    public function delete(string $session, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('DELETE', $this->path($session, $groupId), options:$options);
    }
    /** @return ApiResponse<Success> */
    public function leave(string $session, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $groupId).'/leave', options:$options);
    }
    /** @param array{value:string} $body
     * @return ApiResponse<Success> */
    public function setSubject(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $groupId).'/subject', $body, options:$options);
    }
    /** @param array{value:string} $body
     * @return ApiResponse<Success> */
    public function setDescription(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $groupId).'/description', $body, options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:array{code:string}}> */
    public function getInviteCode(string $session, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{code:string}}> */
        return $this->request('GET', $this->path($session, $groupId).'/invite-code', options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:array{code:string}}> */
    public function revokeInviteCode(string $session, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:array{code:string}}> */
        return $this->request('POST', $this->path($session, $groupId).'/invite-code/revoke', options:$options);
    }
    /** @return ApiResponse<array{success:bool,data:list<Participant>}> */
    public function listParticipants(string $session, string $groupId, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<array{success:bool,data:list<Participant>}> */
        return $this->request('GET', $this->path($session, $groupId).'/participants', options:$options);
    }
    /** @param array{participants:list<string>} $body
     * @return ApiResponse<Success> */
    public function addParticipants(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $groupId).'/participants/add', $body, options:$options);
    }
    /** @param array{participants:list<string>} $body
     * @return ApiResponse<Success> */
    public function removeParticipants(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $groupId).'/participants/remove', $body, options:$options);
    }
    /** @param array{participants:list<string>} $body
     * @return ApiResponse<Success> */
    public function promoteParticipants(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $groupId).'/admin/promote', $body, options:$options);
    }
    /** @param array{participants:list<string>} $body
     * @return ApiResponse<Success> */
    public function demoteParticipants(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('POST', $this->path($session, $groupId).'/admin/demote', $body, options:$options);
    }
    /** @param array{url?:string,base64?:string} $body
     * @return ApiResponse<Success> */
    public function setPicture(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $groupId).'/picture', $body, options:$options);
    }
    /** @param array{adminsOnly:bool} $body
     * @return ApiResponse<Success> */
    public function setInfoEditing(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $groupId).'/settings/info-edit', $body, options:$options);
    }
    /** @param array{adminsOnly:bool} $body
     * @return ApiResponse<Success> */
    public function setMessaging(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $groupId).'/settings/messages', $body, options:$options);
    }
    /** @param array{mode:'admin_add'|'all_member_add'} $body
     * @return ApiResponse<Success> */
    public function setMemberAddMode(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $groupId).'/settings/member-add', $body, options:$options);
    }
    /** @param array{required:bool} $body
     * @return ApiResponse<Success> */
    public function setJoinApproval(string $session, string $groupId, array $body, ?RequestOptions $options = null): ApiResponse
    {
        /** @var ApiResponse<Success> */
        return $this->request('PUT', $this->path($session, $groupId).'/settings/join-approval', $body, options:$options);
    }
    private function path(string $session, ?string $groupId = null): string
    {
        return '/messaging/'.self::segment($session).'/groups'.($groupId === null ? '' : '/'.self::segment($groupId));
    }
}
