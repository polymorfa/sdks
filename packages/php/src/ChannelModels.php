<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type Identity from HistoryModels
 * @phpstan-import-type ProviderIds from HistoryModels
 * @phpstan-type Channel array{id?:string,name?:string,description?:string,profileUrl?:string,followers?:int,muted?:bool,preview?:bool}
 * @phpstan-type CreateChannel array{name:string,description?:string,picture?:string}
 * @phpstan-type ChannelMessage array{position:int,id:string,whatsapp_ids:ProviderIds,whatsapp_id?:string,conversation:Identity,type:string,timestamp:string,views:int,reactionCounts:array<string,int>,text?:string}
 * @phpstan-type MessagesParams array{count?:int,before?:int}
 * @phpstan-type UpdatesParams array{count?:int,since?:int,after?:int}
 * @phpstan-type Reaction array{reaction:string}
 * @phpstan-type LiveUpdates array{durationSeconds:int}
 * @phpstan-type Accepted array{requestId:string}
 */
final class ChannelModels
{
    private function __construct()
    {
    }
}
