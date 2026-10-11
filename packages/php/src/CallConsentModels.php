<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Retention array{policy:'short'|'standard'|'extended'|'compliance'|'custom',retentionDays:int,appliesTo:list<string>,revision:int,updatedAt:?string}
 * @phpstan-type UpdateRetention array{policy:'custom',retentionDays:int,expectedRevision?:int}|array{policy:'short'|'standard'|'extended'|'compliance',retentionDays?:int,expectedRevision?:int}
 * @phpstan-type Policy array{blockedCountryCodes:list<string>,optOutCount:int,revision:int,updatedAt:?string}
 * @phpstan-type UpdatePolicy array{blockedCountryCodes:list<string>,expectedRevision?:int}
 * @phpstan-type OptOut array{id:string,phoneNumber:?string,bsuid:?string,note:?string,source:'api'|'console'|'import',createdAt:string}
 * @phpstan-type ListOptOuts array{limit?:int,cursor?:string,phoneNumber?:string,bsuid?:string}
 * @phpstan-type CreateOptOut array{phoneNumber:string,note?:string}|array{bsuid:string,note?:string}
 * @phpstan-type ImportEntry array{phoneNumber?:string,bsuid?:string,note?:string}
 * @phpstan-type ImportRequest array{entries:list<ImportEntry>}
 * @phpstan-type ImportResult array{added:int,existing:int,rejected:list<array{index:int,reason:'invalid_phone_number'|'invalid_bsuid'|'missing_identifier'|'multiple_identifiers'|'invalid_note'}>}
 * @phpstan-type Deleted array{id:string,deleted:true}
 */
final class CallConsentModels
{
}
