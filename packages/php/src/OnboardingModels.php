<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Connection 'linked_devices'|'official_api'
 * @phpstan-type Scope array{scope:'team'}|array{scope:'project',projectId:string}|array{scope:'session',projectId:string,session:string}
 * @phpstan-type RoutingPolicy array{scope:'team'|'project'|'session',revision:string,prefer:Connection|null,allowedTransports:list<Connection>}
 * @phpstan-type SetPolicy array{expectedRevision:string,prefer:Connection|null,allowedTransports:list<Connection>}
 * @phpstan-type LinkState array{revision:string,paused:bool,connections:list<array{kind:Connection,status:string,enabled:bool}>}
 * @phpstan-type PolicyValues array{presenceMode:'off'|'events'|'cache',typingMode:'off'|'events'|'cache',labelMode:'off'|'events'|'cache'|'project',quickReplyMode?:'off'|'events'|'cache'}
 * @phpstan-type ProjectPolicy array{projectId:string,presenceMode:'off'|'events'|'cache',typingMode:'off'|'events'|'cache',labelMode:'off'|'events'|'cache'|'project',quickReplyMode?:'off'|'events'|'cache'}
 * @phpstan-type SessionPolicy array{sessionName:string,projectId:string,project:PolicyValues,override:array{presenceMode:'off'|'events'|'cache'|'inherit',typingMode:'off'|'events'|'cache'|'inherit',labelMode:'off'|'events'|'cache'|'project'|'inherit',quickReplyMode?:'off'|'events'|'cache'|'inherit'},effective:PolicyValues}
 * @phpstan-type Signup array{quicklinkId:string,projectId?:string,result?:array{code:string,wabaId:string,phoneNumberId:string,coexistence?:bool,historySync?:bool}}
 * @phpstan-type HistoryMessage array{id:string,senderPhone:string,text:string,timestamp:int|float,fromMe:bool}
 * @phpstan-type Fixture 'message.received'|'message.ack'|'message.failed'|'call.received'|'call.missed'|'call.ended'|'session.status'|'session.restriction_updated'|'template.status'
 * @phpstan-type Overrides array{text?:string,from?:string,pushName?:string,mediaType?:'image'|'video'|'audio'|'document'|'sticker',caption?:string,ackStatus?:'delivered'|'read'|'played'|'error',messageId?:string,failureReason?:'invalid_recipient'|'session_not_connected'|'ack_timeout'|'send_failed'|'blocked_by_safety',video?:bool,durationSeconds?:int|float,callEndReason?:'user_hangup'|'timeout'|'lost_connection'|'rejected'|'call_restricted',restrictionActive?:bool,status?:'CONNECTING'|'CONNECTED'|'DISCONNECTED',statusReason?:'SCAN_QR'|'AUTO_RECONNECT'|'FAILED'|'MANUAL_STOP'|'QR_TIMEOUT'|'LOGGED_OUT'|'TEMPORARY_BAN'|'STREAM_ERROR',templateName?:string,templateStatus?:'APPROVED'|'REJECTED',reason?:string}
 * @phpstan-type Trigger array{session:string,event:Fixture,overrides?:Overrides,fromSession?:string}
 * @phpstan-type TriggerResult array{event:Fixture,session:string,delivery:'generated'|'simulated',eventId:?string,source:'test'|'runtime'}
 * @phpstan-type Phone array{session:string,phone:string,online:bool,devices:list<array{deviceId:int}>}
 */
final class OnboardingModels
{
    private function __construct()
    {
    }
}
