<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Hms array{enabled:false}|array{enabled:true,region:string,policy:'short'|'standard'|'extended'|'compliance'|'enterprise_archive',retentionDays?:int,policyVersion?:string,legalHold?:bool}
 * @phpstan-type Observation array{presenceMode:'off'|'events'|'cache',typingMode:'off'|'events'|'cache',labelMode:'off'|'events'|'cache'|'project',quickReplyMode:'off'|'events'|'cache'}
 * @phpstan-type ObservationPatch array{presenceMode?:'off'|'events'|'cache',typingMode?:'off'|'events'|'cache',labelMode?:'off'|'events'|'cache'|'project',quickReplyMode?:'off'|'events'|'cache'}
 * @phpstan-type History array{mode:'metadata_only'|'deliver',requestFull:bool}
 * @phpstan-type Overrides array{observation?:ObservationPatch,historySync?:array{mode?:'metadata_only'|'deliver',requestFull?:bool},hms?:Hms}
 * @phpstan-type Source 'platform'|'team'|'project'|'session'
 * @phpstan-type Configuration array{effective:array{observation:Observation,historySync:History,hms:Hms},overrides:Overrides,sources:array{'historySync.mode':Source|'consent','historySync.requestFull':Source|'consent',hms:Source,'observation.presenceMode':Source,'observation.typingMode':Source,'observation.labelMode':Source,'observation.quickReplyMode':Source},requestedHistory:History,revisions:array{team:int,project:int,session:int},historyConsent?:'pending'|'accepted'|'declined',application?:array{desiredGeneration:int,appliedGeneration:int,status:'pending'|'applied'}}
 * @phpstan-type ConfigurationPatch array{set?:Overrides,reset?:list<'historySync'|'historySync.mode'|'historySync.requestFull'|'hms'|'observation'|'observation.presenceMode'|'observation.typingMode'|'observation.labelMode'|'observation.quickReplyMode'>}
 * @phpstan-type NewChatCapping array{enabled:?bool,pacing:bool,status:'none'|'first_warning'|'second_warning'|'capped'|null,capped:bool,limit:?int,used:?int,remaining:?int,cycleStartsAt:?string,resetsAt:?string,observedAt:string}
 * @phpstan-type Session array{sessionId:string,name:string,tenantId:string,type:'linked_device'|'cloud_api',testMode:bool,status:string,createdAt:string,updatedAt:string,externalId?:string,statusReason?:string,configuration?:Configuration,newChatCapping?:NewChatCapping|null}
 * @phpstan-type PlatformSession array{_id:string,_creationTime:int,projectId:string,sessionId:string,name:string,phone:?string,platform:?string,isBusiness:bool,testMode:bool,tierOverride:'free'|'standard'|'pro'|'scale'|null,status:string,messageCount:int,lastActiveAt:?int,paidUntil:?int}
 * @phpstan-type Account array{pushName:string,id?:string,bsuid?:string,username?:string,phoneNumber?:string,businessName?:string,phonePlatform?:'android'|'ios'|'meta_cloud'|'unknown',accountType?:'whatsapp_app'|'business_app'|'meta_cloud'|'meta_coexistence',profilePicUrl?:string}
 * @phpstan-type OperationAccepted array{success:true,message:string,operationId:string}
 */
final class SessionModels
{
    private function __construct()
    {
    }
}
