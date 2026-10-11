<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Identity array{id:string,phoneNumber?:string,bsuid?:string,username?:string}
 * @phpstan-type ProviderIds array{linked_devices:string,official_api?:string}|array{linked_devices?:string,official_api:string}
 * @phpstan-type MessageSummary array{id:string,whatsapp_ids:ProviderIds,whatsapp_id?:string,direction:'inbound'|'outbound',type:string,timestamp:string}
 * @phpstan-type Media array{id:string,mimeType:string,fileLength:int,url:string}
 * @phpstan-type MediaRetrieval array{state:'pending'|'stored'|'unavailable'|'expired'|'too_large'|'unsupported_type'|'failed'|'cancelled',reason?:string}
 * @phpstan-type HistoryMessage array{id:string,whatsapp_ids:ProviderIds,whatsapp_id?:string,direction:'inbound'|'outbound',type:string,timestamp:string,conversation:array{id:string,phoneNumber?:string,bsuid?:string,username?:string,sender?:Identity},fromMe:bool,pushName?:string,text?:string,caption?:string,mimeType?:string,filename?:string,ptt?:bool,latitude?:float,longitude?:float,displayName?:string,title?:string,reaction?:string,reactionTo?:string,edited?:bool,unavailable?:bool,unavailableReason?:string,pollOptions?:list<array{name:string,hash:string}>,media?:list<Media>,mediaRetrieval?:MediaRetrieval}
 * @phpstan-type HistoryChat array{conversation:Identity,kind:'direct'|'group'|'channel'|'broadcast',lastActivityAt:string,lastMessage:MessageSummary}
 * @phpstan-type ChatParams array{limit?:int,cursor?:string,kind?:'direct'|'group'|'channel'|'broadcast',activeSince?:string,activeBefore?:string}
 * @phpstan-type MessageParams array{limit?:int,cursor?:string,order?:'desc'|'asc',since?:string,until?:string,direction?:'inbound'|'outbound',types?:string}
 * @phpstan-type EditMessage array{text:string,transport?:'auto'|'linked_devices'|'official_api'}
 * @phpstan-type ServiceWindow array{state:'open'|'closed'|'unknown',reason:'not_tracked'|'tracking_started'|'notifications_interrupted'|'identity_unlinked'|null,openedAt:string|null,expiresAt:string|null,checkedAt:string}
 */
final class HistoryModels
{
    private function __construct()
    {
    }
}
