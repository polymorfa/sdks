<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * Missing, null or wrong-type attributes do not match.
 * @phpstan-type Condition array{field:'tag',operator:'contains',value:string}|array{field:'tag',operator:'in',values:list<string>}|array{field:'tag',operator:'exists'}|array{field:'attribute',name:string,operator:'equals',value:string|int|float|bool}|array{field:'attribute',name:string,operator:'contains'|'before'|'after',value:string}|array{field:'attribute',name:string,operator:'in',values:list<string|int|float>}|array{field:'attribute',name:string,operator:'greater_than'|'less_than',value:int|float}|array{field:'attribute',name:string,operator:'exists'}|array{field:'consent',operator:'equals',value:bool}|array{field:'campaign',campaignId:string,outcome:'delivered'|'not_delivered'|'read'|'not_read'|'replied'|'not_replied'|'failed'}
 * @phpstan-type Group array{match:'all'|'any',negate?:bool,conditions:list<Condition>}
 * @phpstan-type Rules array{match:'all'|'any',groups:list<Group>}
 * @phpstan-type Segment array{id:string,name:string,revision:int,rules:array{match:'all'|'any',groups:list<array{match:'all'|'any',negate?:bool,conditions:list<array<string,mixed>>}>},createdAt:int|float,updatedAt:int|float}
 * @phpstan-type Preview array{matchedCount:int,optedOutCount:int,consentWithheldCount:int,eligibleCount:int,sample:list<array{phone:string,tags:list<string>}>,evaluatedAt:int|float}
 * @phpstan-type SavedPreview array{matchedCount:int,optedOutCount:int,consentWithheldCount:int,eligibleCount:int,sample:list<array{phone:string,tags:list<string>}>,evaluatedAt:int|float,revision:int}
 * @phpstan-type CreateInput array{name:string,rules:Rules}
 * @phpstan-type UpdateInput array{expectedRevision:int,name?:string,rules?:Rules}
 */
final class AudienceSegmentModels
{
    private function __construct()
    {
    }
}
