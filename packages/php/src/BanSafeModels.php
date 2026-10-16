<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Presence 'dark'|'online_while_sending'|'online_hours'
 * @phpstan-type Typing 'off'|'before_text'|'before_all'
 * @phpstan-type Reads 'off'|'replied_chats'|'all_inbound'
 * @phpstan-type Pacing 'off'|'jittered'|'conversation'
 * @phpstan-type Settings array{presence:Presence,typing:Typing,reads:Reads,pacing:Pacing,onlineStart:int,onlineEnd:int}
 * @phpstan-type UpdateProjectSafeMode array{presence?:Presence,typing?:Typing,reads?:Reads,pacing?:Pacing,onlineStart?:int,onlineEnd?:int}
 * @phpstan-type ProjectSafeMode array{projectId:string,ceiling:Settings,entitled:bool,entitlementReason:string|null}
 * @phpstan-type Override array{presence:Presence|'inherit',typing:Typing|'inherit',reads:Reads|'inherit',pacing:Pacing|'inherit'}
 * @phpstan-type Applied array{observedAt:string,presence:string|null,typing:string|null,reads:string|null,pacing:string|null}
 * @phpstan-type SessionSafeMode array{session:string,projectId:string,project:Settings,override:Override,effective:Settings,applied:Applied|null,mismatch:bool,entitled:bool,entitlementReason:string|null}
 * @phpstan-type UpdateSessionSafeMode array{presence?:Presence|'inherit',typing?:Typing|'inherit',reads?:Reads|'inherit',pacing?:Pacing|'inherit'}
 * @phpstan-type WarmupSettings array{enabled:bool,warmupDays:int,dailyStart:int}
 * @phpstan-type CurvePoint array{day:int,allowance:int}
 * @phpstan-type ProjectWarmupPlan array{projectId:string,plan:WarmupSettings,ceiling:int,curve:list<CurvePoint>,entitled:bool,entitlementReason:string|null}
 * @phpstan-type UpdateProjectWarmupPlan array{enabled?:bool,warmupDays?:int,dailyStart?:int}
 * @phpstan-type ProjectInsuranceEvidence array{projectId:string,enabled:bool,banInsuranceIncluded:bool}
 * @phpstan-type UpdateProjectInsuranceEvidence array{enabled:bool}
 * @phpstan-type HealthAction 'none'|'stop'|'slow_down'|'log_out'
 * @phpstan-type HealthIntegrations array{emailConfigured:bool,webhookConfigured:bool}
 * @phpstan-type UpdateProjectHealthPolicy array{version:int,enabled:bool,threshold:float,sessionAction:HealthAction,slowDownMps:float|null,emailNotification:bool,webhookNotification:bool}
 * @phpstan-type ProjectHealthPolicy array{projectId:string,version:int,enabled:bool,threshold:float,sessionAction:HealthAction,slowDownMps:float|null,emailNotification:bool,webhookNotification:bool,integrations:HealthIntegrations}
 */
final class BanSafeModels
{
    private function __construct()
    {
    }
}
