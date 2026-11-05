<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Status 'active'|'archiving'|'archived'
 * @phpstan-type Customer array{id:string,orgId:string,projectId:string,name:?string,externalCustomerId:?string,status:Status,isDefault:bool,archivedAt:?int,createdAt:int,updatedAt:int}
 * @phpstan-type Summary array{id:string,orgId:string,projectId:string,name:?string,externalCustomerId:?string,status:Status,isDefault:bool,archivedAt:?int,createdAt:int,updatedAt:int,numberCount:int,connectedNumberCount:int,activePairingLinkState:?string,lastActivityAt:?int,needsAttention:bool}
 * @phpstan-type CustomersStatus array{enabled:bool,enabledAt:?int,enabledBy:?string,defaultCustomer:Customer|null}
 * @phpstan-type Enablement array{enabled:bool,enabledAt:?int,enabledBy:?string,defaultCustomer:Customer|null,migratedNumberCount:int}
 * @phpstan-type ProjectRequest array{projectId?:string}
 * @phpstan-type CustomerWrite array{projectId?:string,name?:?string,externalCustomerId?:?string}
 * @phpstan-type ListParams array{projectId:string,cursor?:string,limit?:int,search?:string,status?:Status|'all',isDefault?:bool,hasNumbers?:bool,needsAttention?:bool}
 * @phpstan-type ListEnvelope array{data:list<Summary>,page:array{nextCursor:?string,hasMore:bool}}
 * @phpstan-type CustomerNumber array{id:string,customerId:string,sessionId:string,name:?string,phoneMasked:?string,status:string,backend:?string,createdAt:int}
 * @phpstan-type Event array{id:string,action:string,fromStatus:?string,toStatus:?string,sessionId:?string,pairingLinkId:?string,metadata:array{fields?:list<'name'|'phone'|'externalCustomerId'>},occurredAt:int}
 * @phpstan-type PairingLink array{id:string,orgId:string,projectId:string,customerId:string,expectedPhoneMasked:?string,methods:list<'qr'|'phone'>,locale:'en'|'pt-BR'|null,theme:'light'|'dark'|'system'|null,expiresAt:int,status:'active'|'opened'|'connecting'|'connected'|'failed'|'expired'|'revoked',attemptCount:int,maxAttempts:int,pendingSessionId:?string,createdBy:?string,reservedAt:?int,openedAt:?int,connectingAt:?int,connectedAt:?int,failedAt:?int,expiredAt:?int,revokedAt:?int,lastErrorCode:?string,failedExchangeCount:int,phoneMismatchCount:int,createdAt:int,updatedAt:int}
 * @phpstan-type CreatedPairingLink array{id:string,orgId:string,projectId:string,customerId:string,expectedPhoneMasked:?string,methods:list<'qr'|'phone'>,locale:'en'|'pt-BR'|null,theme:'light'|'dark'|'system'|null,expiresAt:int,status:'active'|'opened'|'connecting'|'connected'|'failed'|'expired'|'revoked',attemptCount:int,maxAttempts:int,pendingSessionId:?string,createdBy:?string,reservedAt:?int,openedAt:?int,connectingAt:?int,connectedAt:?int,failedAt:?int,expiredAt:?int,revokedAt:?int,lastErrorCode:?string,failedExchangeCount:int,phoneMismatchCount:int,createdAt:int,updatedAt:int,url:?string}
 * @phpstan-type CreatePairingLink array{projectId?:string,expectedPhone?:?string,methods?:list<'qr'|'phone'>,expiresInSeconds?:int}
 * @phpstan-type EventParams array{projectId:string,limit?:int}
 * @phpstan-type Transfer array{projectId:string,sourceCustomerId:string,confirm:true}
 */
final class CustomerModels
{
    private function __construct()
    {
    }
}
