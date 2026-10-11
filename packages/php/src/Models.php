<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * Public immutable wire shapes, consumed by PHPStan and IDEs without generated clients.
 * @phpstan-type Success array{success:bool,message?:string,operationId?:string}
 * @phpstan-type Identity array{id?:string,phoneNumber?:string,bsuid?:string,username?:string}
 * @phpstan-type Contact array{id:string,name:string,pushName:string,phoneNumber?:string,bsuid?:string,username?:string,businessName?:string,profileUrl?:string}
 * @phpstan-type ContactCheck array{exists:bool,id?:string,phoneNumber?:string,bsuid?:string,username?:string}
 * @phpstan-type UserInfo array{id:string,status:string,pictureId:string,verifiedName:string,devices:list<Identity&array{device:int}>,phoneNumber?:string,bsuid?:string,username?:string}
 * @phpstan-type BusinessProfile array{id:string,phoneNumber?:string,bsuid?:string,username?:string,address:string,email:string,description:string,websites:list<string>,coverPhotoId:string,categories:list<array{id:string,name:string}>,options:array<string,string>,hoursTimeZone:string,hours:list<array{dayOfWeek:string,mode:string,openTime:string,closeTime:string}>}
 * @phpstan-type Profile array{name:string,status:string,profilePicUrl?:string,phonePlatform?:string,accountType?:string}
 * @phpstan-type Privacy array{groupAdd:'all'|'contacts'|'contact_blacklist'|'none',lastSeen:'all'|'contacts'|'contact_blacklist'|'none',status:'all'|'contacts'|'contact_blacklist'|'none',profile:'all'|'contacts'|'contact_blacklist'|'none',readReceipts:'all'|'none',online:'all'|'match_last_seen',callAdd:'all'|'known',messages:'all'|'contacts',defense:'on_standard'|'off',stickers:'contacts'|'contact_allowlist'|'none'}
 * @phpstan-type Label array{id:string,name:string,color:int,orderIndex?:int,chatCount?:int,observedAt?:string}
 * @phpstan-type LabelCollection array{policy:'off'|'events'|'cache'|'project',status:'disabled'|'unknown'|'partial'|'fresh',unknownReason?:'observation_disabled'|'not_retained'|'not_observed'|'expired',observedAt?:string,expiresAt?:string,labels:list<Label>}
 * @phpstan-type LabelRead list<Label>|LabelCollection
 * @phpstan-type Presence array{authoritative:false,desired?:'available'|'unavailable',desiredAt?:string,lastSent?:'available'|'unavailable',lastSentAt?:string}
 * @phpstan-type ChatState array{sender:string,state:'composing'|'paused',media?:string,observedAt:string,stale:bool}
 * @phpstan-type ChatPresence array{policy:'off'|'events'|'cache',status:'unknown'|'fresh'|'stale',unknownReason?:'disabled'|'not_observed'|'suspended',available?:bool,lastSeen?:string,observedAt?:string,subscriptionExpiresAt?:string,stale:bool,typingPolicy:'off'|'events'|'cache',typingStatus:'unknown'|'fresh'|'stale',typingUnknownReason?:'disabled'|'not_observed'|'suspended',chatState?:ChatState}
 */
final class Models
{
    private function __construct()
    {
    }
}
