<?php

declare(strict_types=1);
namespace Polymorfa;

/** Beta native Number cache shapes. Graph resources remain separate.
 * @phpstan-type CatalogAttempt array{startedAt:string,finishedAt:?string,outcome:string,metaErrorCode?:int}
 * @phpstan-type CatalogSync array{catalogId:string,syncedAt:?string,stale:bool,productCount:int,lastAttempt:CatalogAttempt}
 * @phpstan-type CatalogProduct array{id:string,retailerId?:string,name?:string,description?:string,price?:string,currency?:string,availability?:string,reviewStatus?:string,visibility?:string,imageUrl?:string,url?:string}
 * @phpstan-type ProductPage array{catalog:CatalogSync,products:list<CatalogProduct>,nextCursor?:string}
 * @phpstan-type CloudOrderItem array{productRetailerId:string,quantity:positive-int,itemPrice:int|float,currency:string}
 * @phpstan-type CloudOrder array{catalogId:string,text?:string,items:list<CloudOrderItem>}
 * @phpstan-type MarketingStatus array{wabaId:string,onboarding:array{status:'onboarded'|'eligible'|'unknown',metaStatus:?string},terms:array{status:'signed'|'requested'|'not_started'|'unknown',metaStatus:?string,date:?string},cloudApiMarketingDisabled:?bool,nextAction:'none'|'accept_terms'|'review_in_whatsapp_manager',guideUrl:string,observedAt:string}
 */
final class OfficialRound2Models
{
    // Informational values of the open nullable QuickLink errorCode, never PublicError.
    public const READINESS_CODES = ['meta_credentials_invalid','meta_phone_not_registered','meta_webhook_not_subscribed','meta_payment_method_missing','meta_quality_flagged','meta_readiness_unknown'];
    private function __construct() {}
}
