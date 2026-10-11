<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type RecipientInput from CampaignModels
 * @phpstan-import-type InvalidRow from CampaignModels
 * @phpstan-type CreateInput array{name:string,source?:'csv'|'manual'|'api',members?:list<RecipientInput>,fileId?:never,mapping?:never}|array{name:string,source?:'csv'|'manual'|'api',members?:never,fileId:string,mapping:array{phone:string,variables?:array<string,string>}}
 * @phpstan-type ImportResult array{id:string,name:string,source:'csv'|'manual'|'api',recipientCount:int,fileId:?string,columns:list<string>|null,sampleRow:array<string,string>|null,mapping:array<string,mixed>|null,createdAt:int|float,updatedAt:int|float,duplicateCount:int,invalidCount:int,invalidRows:list<InvalidRow>}
 * @phpstan-type Member array{id:string,phone:string,variables:array<string,string>,createdAt:int|float}
 * @phpstan-type Added array{listId:string,added:int,recipientCount:int,duplicateCount:int,invalidCount:int,invalidRows:list<InvalidRow>}
 */
final class AudienceModels
{
    private function __construct()
    {
    }
}
