<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Mutation array{shortcut:string,message:string,keywords?:list<string>,count?:int}
 * @phpstan-type QuickReply array{id:string,shortcut:string,message:string,keywords?:list<string>,count?:int}
 * @phpstan-type ObservedReply array{id:string,shortcut:string,message:string,keywords?:list<string>,count?:int,associatedLabelIds:list<string>,observedAt:string}
 * @phpstan-type Collection array{policy:'off'|'events'|'cache',status:'disabled'|'unknown'|'partial'|'fresh',unknownReason?:'observation_disabled'|'not_retained'|'not_observed',observedAt?:string,quickReplies:list<ObservedReply>}
 * @phpstan-type DeletedReply array{id:string,status:'DELETED'}
 * @phpstan-type SecurityCode array{id:string,phoneNumber?:string,username?:string,numericCode:string,qrCode:string}
 */
final class QuickReplyModels
{
    private function __construct()
    {
    }
}
