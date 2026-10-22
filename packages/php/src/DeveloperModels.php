<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type EncodedPayload array{encoding:'base64',contentType:'application/json',data:string}
 * @phpstan-type Availability 'available'|'not_retained'|'expired'|'redacted'|'unavailable'
 * @phpstan-type EventRecord array{id:string,organizationId:string,projectId:?string,type:string,source:'runtime'|'platform'|'test',environment:'development'|'production',createdAt:string,payloadAvailability:Availability,payload:EncodedPayload|null,replayableUntil:?string,metadataExpiresAt:string}
 * @phpstan-type EventParams array{type?:string,since?:string,until?:string,limit?:int,cursor?:string,afterOffset?:string}
 * @phpstan-type IdempotencyReceipt array{id:string,key:string,replayed:bool,createdAt:string,expiresAt:string}
 * @phpstan-type ReplayReceipt array{eventId:string,deliveryId:string,operationId:string,idempotency:IdempotencyReceipt}
 * @phpstan-type RetryPolicy array{maximumAttempts:int,backoff:'constant'|'linear'|'exponential',initialDelaySeconds:int|float}
 * @phpstan-type HeaderInput array{name:string,value:string}
 * @phpstan-type SecretMetadata array{version:int,createdAt:string,previousValidUntil:?string}
 * @phpstan-type Webhook array{id:string,organizationId:string,owner:'organization'|'project',projectId:?string,url:string,eventTypes:list<string>,enabled:bool,format:'native'|'meta',retryPolicy:RetryPolicy,headers:list<array{name:string}>,secret:SecretMetadata,createdAt:string,updatedAt:string}
 * @phpstan-type WebhookCreate array{url:string,eventTypes:list<string>,enabled?:bool,format?:'native'|'meta',retryPolicy?:RetryPolicy,headers?:list<HeaderInput>}
 * @phpstan-type WebhookUpdate array{url?:string,eventTypes?:list<string>,enabled?:bool,format?:'native'|'meta',retryPolicy?:RetryPolicy,headers?:list<HeaderInput>}
 * @phpstan-type WebhookCreation array{webhook:Webhook,operationId:null,idempotency:IdempotencyReceipt,secret:?string,secretAvailable:bool}
 * @phpstan-type WebhookMutation array{webhook:Webhook,operationId:null,idempotency:IdempotencyReceipt}
 * @phpstan-type WebhookDeletion array{webhookId:string,deleted:true,operationId:null,idempotency:IdempotencyReceipt}
 * @phpstan-type WebhookRotation array{webhookId:string,operationId:null,secret:?string,secretAvailable:bool,secretMetadata:SecretMetadata,idempotency:IdempotencyReceipt}
 * @phpstan-type WebhookTest array{eventType?:string,body?:never,sessionId?:never}|array{eventType?:string,body:EncodedPayload,sessionId:string}
 * @phpstan-type DeliveryStatus 'pending'|'delivering'|'retrying'|'succeeded'|'failed'
 * @phpstan-type Delivery array{id:string,organizationId:string,projectId:?string,eventId:string,webhookId:string,status:DeliveryStatus,attemptCount:int,capabilities:array{retryable:bool},payloadAvailability:Availability,replayableUntil:?string,metadataExpiresAt:string,nextAttemptAt:?string,lastAttemptAt:?string,completedAt:?string,createdAt:string,updatedAt:string,lastOutcome:array{statusCode:?int,errorCode:?string}|null}
 * @phpstan-type Attempt array{id:string,organizationId:string,projectId:?string,deliveryId:string,number:int,status:'pending'|'delivering'|'succeeded'|'failed',startedAt:?string,completedAt:?string,nextRetryAt:?string,durationMs:int|float|null,statusCode:?int,errorCode:?string,response:array{contentType:string,excerpt:string,truncated:bool}|null,metadataExpiresAt:string}
 * @phpstan-type DeliveryParams array{webhookId?:string,eventId?:string,status?:DeliveryStatus,since?:string,until?:string,limit?:int,cursor?:string}
 * @phpstan-type DeliveryRetry array{deliveryId:string,attemptId:string,operationId:string,idempotency:IdempotencyReceipt}
 * @phpstan-type OperationStatus 'pending'|'running'|'action_required'|'cancelling'|'succeeded'|'failed'|'cancelled'
 * @phpstan-type OperationKind 'auth_projection_repair'|'session_lifecycle'|'auth_session_purge'|'label_projection_purge'|'billing_reconciliation'|'auto_top_up'|'campaign'|'production_enrollment'|'retention_sweep'|'webhook_redrive'
 * @phpstan-type Progress array{code:string,current:int|float|null,total:int|float|null}
 * @phpstan-type OperationError array{code:string,retryable:bool,details:array<string,mixed>|null}
 * @phpstan-type RequiredAction array{code:string,details:array<string,mixed>|null}
 * @phpstan-type Operation array{id:string,organizationId:string,projectId:?string,kind:OperationKind,status:OperationStatus,resource:array{type:string,id:string},sequence:int,capabilities:array{cancellable:bool,watchable:bool},progress:Progress|null,result:mixed,error:OperationError|null,actionRequired:RequiredAction|null,createdAt:string,updatedAt:string,completedAt:?string}
 * @phpstan-type OperationParams array{status?:OperationStatus,kind?:OperationKind,resourceType?:string,resourceId?:string,since?:string,until?:string,limit?:int,cursor?:string,projectId?:string}
 * @phpstan-type Transition array{operationId:string,sequence:int,fromStatus:OperationStatus|null,toStatus:OperationStatus,reasonCode:?string,occurredAt:string,snapshot:array{progress:Progress|null,error:OperationError|null,actionRequired:RequiredAction|null}}
 * @phpstan-type Cancellation array{operation:Operation,operationId:string,idempotency:IdempotencyReceipt}
 */
final class DeveloperModels
{
    private function __construct()
    {
    }
}
