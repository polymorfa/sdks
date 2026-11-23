<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type HybridTransport 'linked_devices'|'official_api'
 * @phpstan-type HybridResolution array{action:'keep',transport:HybridTransport}|array{action:'split',existingConnectionTransport:HybridTransport,newConnectionName:string}
 * @phpstan-type QuoteBase array{projectId?:string,tierOverride:'free'|'standard'|'pro'|null}
 * @phpstan-type TierQuoteRequest array{projectId?:string,tierOverride:'free'|'standard'|'pro'|null,hybridResolution?:never,hybridMerge?:never}|array{projectId?:string,tierOverride:'free'|'standard'|'pro'|null,hybridResolution:HybridResolution,hybridMerge?:never}|array{projectId?:string,tierOverride:'free'|'standard'|'pro'|null,hybridResolution?:never,hybridMerge:array{absorbConnectionId:string}}
 * @phpstan-type TransitionBase array{survivingConnectionId:string,status?:'scheduled'|'running'|'completed'|'failed'|'cancelled',failureReason?:?string,metaDisconnectRequired?:bool,effectiveAtMs?:?int}
 * @phpstan-type HybridTransition array{survivingConnectionId:string,status?:'scheduled'|'running'|'completed'|'failed'|'cancelled',failureReason?:?string,metaDisconnectRequired?:bool,effectiveAtMs?:?int,action:'keep',keepTransport:HybridTransport}|array{survivingConnectionId:string,status?:'scheduled'|'running'|'completed'|'failed'|'cancelled',failureReason?:?string,metaDisconnectRequired?:bool,effectiveAtMs?:?int,action:'split',existingConnectionTransport:HybridTransport,newConnectionName:string,newConnectionId?:string}|array{survivingConnectionId:string,status?:'scheduled'|'running'|'completed'|'failed'|'cancelled',failureReason?:?string,metaDisconnectRequired?:bool,effectiveAtMs?:?int,action:'merge',absorbConnectionId:string}
 * @phpstan-type TierChange array{id:string,status:'quoted'|'queued'|'applied'|'rejected',failureReason:?string,expiresAtMs:int,quote:array{tier:string,tierOverride:?string,amountCents:int|float,priceVersion:string,action:'upgrade'|'downgrade'|'configure',effectiveAtMs:int,replacesWindowId:?string,hybridTransition?:HybridTransition}}
 * @phpstan-type ConnectionContext array{projectId?:string}
 * @phpstan-type BatchRequest array{projectId?:string,connectionIds:list<string>}
 * @phpstan-type CapabilitySource 'server'|'client_default'|'account_type'|null
 * @phpstan-type Capability array{key:string,source:CapabilitySource,kind:'feature',unit:null,value:?bool}|array{key:string,source:CapabilitySource,kind:'limit',unit:'seconds'|'count'|'characters'|'members',value:?int}
 * @phpstan-type Capabilities array{connection:string,projectId:string,status:'synced'|'unknown',syncedAt:?string,checkedAt:?string,accountType:'business'|'personal'|null,capabilities:list<Capability>}
 */
final class PlatformConnectionModels
{
    private function __construct()
    {
    }
}
