<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type CustomerAction 'send_message'|'send_reaction'|'send_typing'|'send_seen'|'read_presence'|'subscribe_presence'|'read_contact'|'chats_read'|'chats_manage'|'contact_write'|'contact_delete'
 * @phpstan-type SessionAction CustomerAction|'mcp'|'voip_place'|'voip_answer'|'voip_signal'|'groups_read'|'groups_manage'
 * @phpstan-type MintSession array{ephemeralId:string,session:string,allow?:list<SessionAction>,ttlSeconds?:int}
 * @phpstan-type MintCustomer array{ephemeralId:string,customer:string,allow?:list<CustomerAction>,ttlSeconds?:int}
 * @phpstan-type TokenValue array{token:string,expiresAt:string}
 * @phpstan-type ClientRules array{recipientMode:'conversation'|'any'|'none'|'verified',allowedActions:string,rateLimit:int,maxDaily:int,allowedOrigins:string,conversationTtlSeconds:int,maxConcurrency:int,maxSetupsPerMinute:int,allowedNumber:string,enabled:bool}
 * @phpstan-type SetRules array{recipientMode:'conversation'|'any'|'none',enabled:bool,allowedActions?:string,rateLimit?:int,maxDaily?:int,allowedOrigins?:string,conversationTtlSeconds?:int,maxConcurrency?:int,maxSetupsPerMinute?:int,allowedNumber?:string}
 */
final class ClientTokenModels
{
    private function __construct()
    {
    }
}
