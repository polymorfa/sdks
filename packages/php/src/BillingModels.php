<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Scope 'project'|'customer'|'number'
 * @phpstan-type Balance array{balanceCents:int|float,preferredCurrency:'USD'|'BRL'|'INR'}
 * @phpstan-type BillingUsage array{activeNumbers:int,totalChargedCents:int|float}
 * @phpstan-type Transaction array{id:string,amountCents:int|float,balanceAfterCents:int|float,type:string,description:string,sessionId:?string,projectId:?string,tier:?string,currency:?string,paymentStatus:'paid'|'refunded',createdAt:int}
 * @phpstan-type Pricing array{id:string,tier:string,dailyRateCents:int|float,label:string,description:string,features:list<string>}
 * @phpstan-type Priority array{id:string,name:string,priority:int}
 * @phpstan-type ResourcePriority array{id:string,name:string,priority:int,projectId:string}
 * @phpstan-type Priorities array{revision:int,projects:list<Priority>,customers:list<ResourcePriority>,numbers:list<ResourcePriority>}
 * @phpstan-type Limit array{scope:Scope,resourceId:string,projectId:string,name:string,limitCredits:int|float|null,spentCredits:int|float,reservedCredits:int|float,revision:int}
 * @phpstan-type Limits array{checkedAt:string,periodStart:string,periodEnd:string,todayCredits:int|float,monthCredits:int|float,daily:list<array{date:string,credits:int|float}>,budgets:list<Limit>}
 * @phpstan-type Controls array{budget:Limit,priority:int,priorityRevision:int}
 * @phpstan-type ControlsInput array{limitCredits:int|float|null,priority:int,expectedBudgetRevision:int,expectedPriorityRevision:int}
 * @phpstan-type ReadParams array{scope?:'project',projectId?:string}
 * @phpstan-type Reorder array{scope:'resource',projectId:string,resources:list<array{scope:'customer'|'number',resourceId:string}>,expectedRevision:int}|array{scope:'project',resourceIds:list<string>,expectedRevision:int}|array{scope:'customer'|'number',projectId:string,resourceIds:list<string>,expectedRevision:int}
 */
final class BillingModels
{
    private function __construct()
    {
    }
}
