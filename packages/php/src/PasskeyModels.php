<?php

declare(strict_types=1);
namespace Polymorfa;

/**
 * Direct server passkey DTOs. Supplied ceremony bytes remain opaque.
 * @phpstan-type UserVerification 'required'|'preferred'|'discouraged'
 * @phpstan-type Status 'none'|'challenge_pending'|'assertion_sending'|'assertion_submitted'|'code_available'|'confirmation_sending'|'waiting_for_pairing'|'completed'|'failed'
 * @phpstan-type Issue array{challengeB64Url?:string,ttlSeconds?:int,userVerification?:UserVerification,timeoutMs?:positive-int}
 * @phpstan-type Ticket array{version:2,ticket:string,session:string,rpId:string,challengeB64Url:string,userVerification:UserVerification,expiresAt:string,timeoutMs?:int}
 * @phpstan-type AssertionResponse array{authenticatorDataB64:string,clientDataJSONB64:string,signatureB64:string,userHandleB64?:string}
 * @phpstan-type Assertion array{id:string,rawIdB64Url:string,response:AssertionResponse}
 * @phpstan-type Submit array{ticketId:string,assertion:Assertion}
 * @phpstan-type AssertionResult array{ok:true,ticket:string,session:string}
 * @phpstan-type Confirm array{ticketId:string,code?:string}
 * @phpstan-type Confirmation array{status:Status,ticketId?:string,code?:string,skipHandoffUX?:bool,error?:string}
 */
final class PasskeyModels {}
