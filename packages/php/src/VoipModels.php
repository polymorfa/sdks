<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type Identity from HistoryModels
 * @phpstan-type CallLinkRequest array{session:string,video?:bool}
 * @phpstan-type PreviewCallLinkRequest array{session:string,video?:bool,token:string}
 * @phpstan-type CreatedCallLink array{session:string,token:string,url:string,video:bool}
 * @phpstan-type PreviewedCallLink array{session:string,video:bool,creator:Identity,approvalRequired:bool,isAdmin:bool}
 * @phpstan-type Participant array{id:string,audioMuted:bool,video:bool,state:'invited'|'ringing'|'connected'|'left',handRaised?:bool,phoneNumber?:string,bsuid?:string,username?:string}
 * @phpstan-type CallSettings array{callsEnabled:bool,conferenceMode:bool,inboundRoute:'clients'|'sip_trunk',sipTrunkId:string|null,sipClaim:bool,hostCloudApiCalls:bool,revision:int,updatedAt:string|null}
 * @phpstan-type PermissionLimit array{period:string,maxAllowed:int,used:int,resetsAt:string|null}
 * @phpstan-type PermissionAction array{allowed:bool,limits:list<PermissionLimit>}
 * @phpstan-type PermissionState array{status:'none'|'temporary'|'permanent'|'revoked',expiresAt:string|null,source:'user_action'|'automatic'|'sync'|'call_refused'|null,updatedAt:string|null,checkedAt:string|null,fresh:bool,actions:array{requestPermission:PermissionAction|null,startCall:PermissionAction|null}|null}
 * @phpstan-type CallPermission array{conversation:Identity,status:'none'|'temporary'|'permanent'|'revoked',expiresAt:string|null,source:'user_action'|'automatic'|'sync'|'call_refused'|null,updatedAt:string|null,checkedAt:string|null,fresh:bool,actions:array{requestPermission:PermissionAction|null,startCall:PermissionAction|null}|null}
 * @phpstan-type CheckRequest array{session:string,to:string}
 * @phpstan-type CallCheck array{allowed:bool,refusal:'calls_disabled'|'call_recipient_opted_out'|'call_destination_blocked'|'call_permission_required'|'call_limit_reached'|null,permission:PermissionState|null}
 * @phpstan-type Reaction array{connectionId:string,participant?:string,emoji:''|'👍'|'❤️'|'😂'|'😮'|'😢'|'🙏'}
 * @phpstan-type HandRaised array{connectionId:string,participant?:string,raised:bool}
 * @phpstan-type ReportClient array{sdk:string,version:string,platform:'browser'|'node'|'other'}
 * @phpstan-type Quality array{rttMs?:int,jitterMs?:int,packetsLost?:int,packetsReceived?:int,audioCodec?:string,videoCodec?:string,candidateType?:'host'|'srflx'|'prflx'|'relay',reconnects?:int}
 * @phpstan-type ErrorCode 'media_permission_denied'|'device_not_found'|'device_in_use'|'ice_failed'|'negotiation_failed'|'media_timeout'|'reconnect_exhausted'|'token_refresh_failed'|'unsupported_browser'|'other'
 * @phpstan-type QualityReport array{kind:'quality',connectionId:string,participant?:string,client?:ReportClient,quality:Quality}
 * @phpstan-type ErrorReport array{kind:'error',connectionId:string,participant?:string,client?:ReportClient,error:array{code:ErrorCode}}
 * @phpstan-type Report QualityReport|ErrorReport
 */
final class VoipModels
{
    private function __construct()
    {
    }
}
