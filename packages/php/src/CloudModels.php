<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type PricingParams array{since?:string,until?:string}
 * @phpstan-type PricingGroup array{category:string,pricingModel:string,pricingType:string|null,billable:bool|null,messages:int}
 * @phpstan-type PricingSummary array{source:'meta',since:string,until:string,messages:int,groups:list<PricingGroup>}
 * @phpstan-type FailureCode 'app_credentials_rejected'|'token_expired'|'token_invalid'|'token_app_mismatch'|'permission_missing'|'phone_not_registered'|'webhook_not_subscribed'|'credentials_unreadable'|'meta_unavailable'|'meta_response_invalid'
 * @phpstan-type TokenHealth array{status:'valid'|'expired'|'invalid'|'unknown',expiresAt:string|null}
 * @phpstan-type CredentialHealth array{status:'pending'|'healthy'|'action_required'|'unknown',checkedAt:string|null,nextCheckAt:string|null,token:TokenHealth,missingPermissions:list<'whatsapp_business_messaging'|'whatsapp_business_management'>,phoneRegistration:'registered'|'not_registered'|'unknown',webhookSubscription:'subscribed'|'not_subscribed'|'unknown',failureCode:FailureCode|null}
 * @phpstan-type Reauthorization array{quicklinkId:string,url:string,session:string}
 */
final class CloudModels
{
    private function __construct()
    {
    }
}
