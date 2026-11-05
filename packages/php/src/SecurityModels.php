<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type AuditLog array{id:string,actorEmail:string,actorUserId:?string,actorRole:?string,action:string,resource:string,projectId:?string,projectName:?string,ip:?string,userAgent:?string,duration:?int,source:?string,description:?string,result:string,metadata:mixed,createdAt:int}
 * @phpstan-type AuditParams array{action?:string,resource?:string,limit?:int}
 * @phpstan-type SessionBan array{id:string,sessionName:string,banCode:?int,banReason:?string,banExpiresAt:?int,occurredAt:int,status:'active'|'lifted'}
 * @phpstan-type Incident array{id:string,keyId:string,tokenType:string,source:string,url:?string,ref:?string,resolution:string,detectedAt:int,acknowledgedAt:?int,acknowledgedBy:?string,createdAt:int}
 * @phpstan-type OptOutSettings array{enabled:bool,optOutKeywords:list<string>,optInKeywords:list<string>,updatedAt:?int}
 * @phpstan-type UpdateOptOutSettings array{enabled:bool,optOutKeywords:list<string>,optInKeywords:list<string>}
 */
final class SecurityModels
{
    private function __construct()
    {
    }
}
