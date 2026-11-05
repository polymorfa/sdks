<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Category 'MARKETING'|'UTILITY'|'AUTHENTICATION'
 * @phpstan-type Header array{format:'none'}|array{format:'text',text:string}|array{format:'image'|'video'|'document',example?:string,filename?:string}|array{format:'location',example?:array{latitude:int|float,longitude:int|float,name?:string,address?:string}}
 * @phpstan-type Button array{type:'quick_reply',text:string}|array{type:'url',text:string,url:string}|array{type:'phone',text:string,phone:string}|array{type:'copy_code',text?:string,example?:string}
 * @phpstan-type Definition array{version:1,kind:'standard'|'carousel'|'authentication'|'limited_time_offer',category:Category,language:string,header?:Header,body:string,footer?:string,buttons?:list<Button>,carousel?:array{cards:list<array{header:array{format:'image'|'video'|'document',example?:string,filename?:string},body:string,buttons?:list<Button>}>},authentication?:array{otpType:'copy_code'|'one_tap',codeExample?:string,addSecurityRecommendation?:bool,codeExpirationMinutes?:int},limitedTimeOffer?:array{text:string,hasExpiration:bool},variables:list<array{name:string,type:'text'|'number'|'currency'|'date_time',example:string}>}
 * @phpstan-type ProjectTemplate array{id:string,name:string,category:string,language:string,status:string,kind:string,definition?:Definition|null,sampleValues?:array<string,string>|null,cloudLinks:list<mixed>,createdAt:int|float,updatedAt:int|float}
 * @phpstan-type ProjectCreate array{name:string,definition:Definition,sampleValues?:array<string,string>}
 * @phpstan-type ProjectUpdate array{name?:string,status?:string,definition?:Definition,sampleValues?:array<string,string>}
 * @phpstan-type CloudTemplate array{id:string,tenantId:string,session:string,wabaId:string,name:string,language:string,category:Category,status:'PENDING'|'APPROVED'|'REJECTED'|'PAUSED'|'DISABLED'|'DELETED'|'ARCHIVED'|'IN_APPEAL'|'LIMIT_EXCEEDED'|'PENDING_DELETION',components:list<mixed>,metaTemplateId?:string,rejectionReason?:string,qualityScore?:string,createdAt:string,updatedAt:string}
 * @phpstan-type CloudCreate array{name:string,language:string,category:Category,components:list<mixed>}
 */
final class TemplateModels
{
    private function __construct()
    {
    }
}
