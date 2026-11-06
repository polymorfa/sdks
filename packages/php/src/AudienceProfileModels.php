<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Source 'api'|'csv'|'form'
 * @phpstan-type Attribute string|int|float|bool|null
 * @phpstan-type Provenance array{source:Source,reference:string}
 * @phpstan-type ConsentInput array{source:Source,reference:string,purpose:'campaigns',allowed:bool,assertedAt:int}
 * @phpstan-type Profile array{id:string,phone:string,revision:int,tags:list<string>,attributes:array<string,Attribute>,provenance:Provenance|null,createdAt:int,updatedAt:int}
 * @phpstan-type PutInput array{tags:list<string>,attributes:array<string,Attribute>,expectedRevision?:int,provenance?:Provenance,consent?:ConsentInput}
 * @phpstan-type Consent array{source:Source,reference:string,purpose:'campaigns',allowed:bool,assertedAt:int,id:string,profileRevision:int,createdAt:int}
 * @phpstan-type PageParams array{cursor?:string,limit?:int}
 * @phpstan-type ListParams array{cursor?:string,limit?:int,tag?:string,phonePrefix?:string}
 * @phpstan-type PageInfo array{nextCursor:string|null,hasMore:bool}
 * @phpstan-type ProfilePage array{data:list<Profile>,page:PageInfo}
 * @phpstan-type ConsentPage array{data:list<Consent>,page:PageInfo}
 * @phpstan-type DeleteResult array{deleted:true,phone:string,revision:int}
 * @phpstan-type ImportMapping array{phone:string,tags:string,attributes:string,expectedRevision?:string,provenanceReference?:string,consentAllowed?:string,consentAssertedAt?:string,consentReference?:string}
 * @phpstan-type ImportInput array{replayKey:string,csvBase64:string,mapping?:ImportMapping}
 * @phpstan-type ImportJob array{id:string,state:'queued'|'completed'|'cancelled',totalValid:int,invalidCount:int,invalidSamples:list<array{row:int,reason:string}>,conflictSamples:list<array{row:int,reason:'quota'|'revision_conflict'}>,processedValid:int,createdCount:int,updatedCount:int,conflictCount:int,createdAt:int,updatedAt:int,completedAt:int|null}
 */
final class AudienceProfileModels
{
}
