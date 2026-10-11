<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Transport 'udp'|'tcp'|'tls'
 * @phpstan-type Codec 'PCMU'|'PCMA'|'opus'
 * @phpstan-type Outbound array{targetUri:string,transport:Transport,authUsername:?string,hasPassword:bool,fromUser:?string}
 * @phpstan-type Inbound array{username:string,realm:string,session:?string,allowedAddresses:list<string>,allowedDestinations:list<string>}
 * @phpstan-type Trunk array{id:string,projectId:string,name:string,enabled:bool,direction:'outbound'|'inbound'|'both',outbound:Outbound|null,inbound:Inbound|null,codecs:list<Codec>,maxConcurrentCalls:int,revision:int,createdAt:string,updatedAt:string}
 * @phpstan-type Credentials array{username:string,password:string,realm:string}
 * @phpstan-type Created array{trunk:Trunk,inboundCredentials?:Credentials}
 * @phpstan-type Endpoint array{status:'hosted',host:string,transports:non-empty-list<array{transport:Transport,port:int,srtp:'required'|'not_supported'}>,rtp:array{protocol:'udp',portMin:int,portMax:int}}|array{status:'sip_not_hosted',host:null,transports:array{},rtp:null}
 * @phpstan-type OutboundInput array{targetUri:string,transport:Transport,authUsername?:?string,authPassword?:string,fromUser?:?string}
 * @phpstan-type InboundInput array{session?:?string,allowedAddresses:list<string>,allowedDestinations?:list<string>}
 * @phpstan-type CreateInput array{name:string,enabled?:bool,codecs?:list<Codec>,maxConcurrentCalls?:int,direction:'outbound',outbound:OutboundInput,inbound?:never}|array{name:string,enabled?:bool,codecs?:list<Codec>,maxConcurrentCalls?:int,direction:'inbound',inbound:InboundInput,outbound?:never}|array{name:string,enabled?:bool,codecs?:list<Codec>,maxConcurrentCalls?:int,direction:'both',outbound:OutboundInput,inbound:InboundInput}
 * @phpstan-type UpdateInput array{expectedRevision?:int,name?:string,enabled?:bool,direction?:'outbound'|'inbound'|'both',outbound?:array{targetUri?:string,transport?:Transport,authUsername?:?string,authPassword?:string,fromUser?:?string},inbound?:array{session?:?string,allowedAddresses?:list<string>,allowedDestinations?:list<string>},codecs?:list<Codec>,maxConcurrentCalls?:int}
 */
final class SipModels
{
    private function __construct()
    {
    }
}
