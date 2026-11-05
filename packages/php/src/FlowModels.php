<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Category 'SIGN_UP'|'SIGN_IN'|'APPOINTMENT_BOOKING'|'LEAD_GENERATION'|'CONTACT_US'|'CUSTOMER_SUPPORT'|'SURVEY'|'OTHER'
 * @phpstan-type DraftStatus 'draft'|'ready'|'archived'
 * @phpstan-type Pointer array{path?:string,lineStart?:int|float,lineEnd?:int|float,columnStart?:int|float,columnEnd?:int|float}
 * @phpstan-type Issue array{error?:string,errorType?:string,message?:string,pointers?:list<Pointer>,lineStart?:int|float,lineEnd?:int|float,columnStart?:int|float,columnEnd?:int|float}
 * @phpstan-type NumberLink array{session:string,sessionId?:string,wabaId:string,metaFlowId:string,status:string,categories:list<string>,validationErrors:list<Issue>,uploadState:'stale'|'creating'|'uploading'|'valid'|'invalid'|'failed',previewUrl?:string,previewExpiresAt?:int|float,lastSyncedAt:int|float,definitionDigest?:string,simulated?:bool}
 * @phpstan-type Summary array{id:string,name:string,status:DraftStatus,version:string,screenCount:int,metaLinks:list<NumberLink>,createdAt:int|float,updatedAt:int|float}
 * @phpstan-type Draft array{id:string,name:string,status:DraftStatus,version:string,screenCount:int,metaLinks:list<NumberLink>,createdAt:int|float,updatedAt:int|float,definition:array<string,mixed>}
 * @phpstan-type CreateInput array{draftId?:string,name:string,definition:array<string,mixed>}
 * @phpstan-type UpdateInput array{expectedUpdatedAt:int|float,name?:string,status?:DraftStatus,definition?:array<string,mixed>}
 * @phpstan-type ProviderInput array{sessionId:string,categories?:list<Category>,requestId?:string}
 * @phpstan-type ProviderOperation array{id:string,requestId:?string,flowId:string,flowName:string,sessionId:string,session:string,action:'create'|'upload'|'publish'|'deprecate'|'delete',state:'pending'|'succeeded'|'rejected'|'uncertain'|'superseded',resolution:'response'|'reconciled'|'superseded'|null,wabaId:?string,metaFlowId:?string,definitionDigest:?string,providerStatus:?string,errorCode:?string,providerCode:int|float|null,providerSubcode:int|float|null,createdAt:int|float,updatedAt:int|float,completedAt:int|float|null}
 * @phpstan-type ProviderResult array{operation:ProviderOperation|null,flow:Draft}
 * @phpstan-type Endpoint array{id:string,orgId:string,projectId:string,flowId:string,sessionId:string,mode:'forward'|'function'|'direct',url:?string,functionId:?string,deploymentId:?string,enabled:bool,revision:int,endpointUri:string,createdAt:int|float,updatedAt:int|float}
 * @phpstan-type ManagedKey array{id:string,state:'pending'|'uncertain'|'active'|'retiring'|'retired'|'failed',fingerprint:string,publicKey:string,errorCode:?string,createdAt:int|float,activatedAt:int|float|null,retireAfter:int|float|null}
 * @phpstan-type Custody array{custody:'managed'|'customer',activeKeyId:?string,keys:list<ManagedKey>}
 * @phpstan-type Rotation array{custody:'managed'|'customer',activeKeyId:?string,keys:list<ManagedKey>,key:ManagedKey}
 * @phpstan-type EndpointState array{endpoint:Endpoint|null,encryption:Custody}
 * @phpstan-type EndpointSetResult array{endpoint:Endpoint,signingSecret?:string,encryption:Custody}
 * @phpstan-type ForwardInput array{sessionId:string,mode:'forward',url:string,enabled?:bool,expectedRevision?:int,rotateSigningSecret?:bool}
 * @phpstan-type FunctionInput array{sessionId:string,mode:'function',functionId:string,deploymentId?:?string,enabled?:bool,expectedRevision?:int}
 * @phpstan-type DirectInput array{sessionId:string,mode:'direct',url:string,enabled?:bool,expectedRevision?:int}
 * @phpstan-type EndpointInput ForwardInput|FunctionInput|DirectInput
 * @phpstan-type ReceiptParams array{sessionId?:string,limit?:int}
 * @phpstan-type Receipt array{id:string,flowId:string,endpointId:string,sessionId:string,mode:'forward'|'function',action:'ping'|'INIT'|'data_exchange'|'BACK'|'error_notification'|null,outcome:'running'|'succeeded'|'rejected'|'failed'|'timeout'|'unavailable',httpStatus:?int,errorCode:?string,keyId:?string,functionInvocationId:?string,durationMs:int|float|null,createdAt:int|float,completedAt:int|float|null}
 */
final class FlowModels
{
    private function __construct()
    {
    }
}
