<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Organization array{id:string,externalId:string,name:string,slug:?string,email:string,timezone:?string,creditBalanceCents:int|float,lowBalanceThresholdCents:int|float,billingEmail:?string,status:?string,plan:?string,planStatus:?string,isActive:bool,createdAt:int,updatedAt:int}
 * @phpstan-type Member array{_id:string,_creationTime:int,orgId:string,userId:string,email:string,name:?string,role:'owner'|'admin'|'member',status:string,invitedAt:?int,joinedAt:?int}
 * @phpstan-type ApiKey array{_id:string,_creationTime:int,id:string,keyId:string,start:string,last4:string,orgId:string,label:string,scopes:int,source:string,expiresAt:int,lastUsed?:int,isActive:bool}
 * @phpstan-type ProjectToken array{id:string,start:string,last4:string,label:?string,scopes:int,expiresAt:?int,createdAt:int,lastUsedAt:?int,revokedAt:?int}
 * @phpstan-type Icon array{type:string,value:string,color?:string,storageId?:string}
 * @phpstan-type ProjectStats array{_id:string,_creationTime:int,orgId:string,name:string,slug:string,icon:Icon|array<string,mixed>,defaultTier:string,isActive:bool,stage:'development'|'production',activeSessions:int,totalSessions:int,totalMessages:int,lastActivity:?int,iconUrl:?string}
 * @phpstan-type CreateProject array{name:string,icon?:array{type:'emoji'|'icon'|'image',value:string,color?:string,storageId?:string},defaultTier?:'free'|'standard'|'pro'}
 * @phpstan-type CreatedProject array{id:string,orgId:string,name:string,slug:string,icon:Icon,defaultTier:'free'|'standard'|'pro',isActive:bool,stage:'development'}
 * @phpstan-type Business array{name:string,website:string,supportEmail:string}
 * @phpstan-type Enrollment array{id:string,orgId:string,name:string,slug:string,stage:'development',operationId:string,enrollmentStatus:'requested'|'approval_required'|'provisioning'|'ready',billingMode:'payg'}
 * @phpstan-type EnrollmentCommand array{operationId:string,action:'approve'|'cancel',accepted:true}
 * @phpstan-type MergeNumber array{id:string,name:string,transport:'linked_devices'|'official_api',status:string,canBeAbsorbed:bool}
 * @phpstan-type MergeCandidate array{numbers:array{MergeNumber,MergeNumber},eligible:bool,ineligibleReason?:'deletion_in_progress'|'not_coexistence'|'different_customer'|'connection_disabled'|'not_connected'|'transition_in_progress'|'pairing_in_progress'|'hms_enabled'}
 */
final class AccountModels
{
    private function __construct()
    {
    }
}
