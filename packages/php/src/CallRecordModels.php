<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type ReportClient from VoipModels
 * @phpstan-import-type ErrorCode from VoipModels
 * @phpstan-type Direction 'inbound'|'outbound'
 * @phpstan-type Outcome 'answered'|'missed'|'declined'|'failed'|'in_progress'
 * @phpstan-type State 'offered'|'accepted'|'rejected'|'missed'|'ended'
 * @phpstan-type Record array{callId:string,projectId:?string,sessionId:string,direction:Direction,upstream:'linked_device'|'cloud_api',outcome:Outcome,state:State,hasVideo:bool,peerRef:?string,startedAt:string,connectedAt:?string,endedAt:?string,durationSeconds:int|float|null,endReason:?string}
 * @phpstan-type Summary array{callId:string,sessionId:string,projectId:?string,direction:Direction,state:State,live:bool,backend:string,hasVideo:bool,peerRef:?string,startedAt:string,connectedAt:?string,endedAt:?string,durationSeconds:int|float|null,endReason:?array{code:string,label:string},answeredBy:?string,exclusive:?bool}
 * @phpstan-type Participant array{id:string,state:'invited'|'ringing'|'connected'|'left',firstSeenAt:string,updatedAt:string,leftReason:?string}
 * @phpstan-type Connection array{id:string,participant:string,transport:'webrtc'|'socket'|'sip'|'unknown',joinedAt:?string,leftAt:?string,reason:'left'|'replaced'|'claimed'|'call_ended'|'sip_busy'|'sip_declined'|'sip_no_answer'|'sip_unavailable'|'sip_auth_failed'|null}
 * @phpstan-type Telemetry array{status:'reported'|'unknown',source:'media_server',setupMs:int|float|null,ringMs:int|float|null,codec:?string,jitterMs:int|float|null,packetsLost:?int,rttMs:int|float|null,receivedKbps:int|float|null,sentKbps:int|float|null}
 * @phpstan-type AppQuality array{reportedAt:string,rttMs:int|float|null,jitterMs:int|float|null,packetsLost:?int,packetsReceived:?int,audioCodec:?string,videoCodec:?string,candidateType:'host'|'srflx'|'prflx'|'relay'|null,reconnects:?int}
 * @phpstan-type AppConnection array{connectionId:string,participant:string,client:?ReportClient,quality:?AppQuality,errors:list<array{code:ErrorCode,reportedAt:string}>}
 * @phpstan-type Detail array{call:Summary,participants:list<Participant>,connections:list<Connection>,telemetry:Telemetry,appReports:array{status:'reported'|'none',connections:list<AppConnection>,truncated:bool},history:array{events:list<array{eventId:string,type:string,occurredAt:string}>,truncated:bool},correlation:array{callId:string,sessionId:string}}
 * @phpstan-type Metrics array{calls:int,answered:int,missed:int,declined:int,failed:int,inProgress:int,answerRate:int|float|null,totalDurationSeconds:int|float,averageDurationSeconds:int|float|null}
 * @phpstan-type StatsGroup array{calls:int,answered:int,missed:int,declined:int,failed:int,inProgress:int,answerRate:int|float|null,totalDurationSeconds:int|float,averageDurationSeconds:int|float|null,key:string,start:?string}
 * @phpstan-type Stats array{since:string,until:string,timezone:string,groupBy:'day'|'hour'|'session'|'outcome',totals:Metrics,groups:list<StatsGroup>,groupsTruncated:bool,heatmap:list<array{dayOfWeek:int,hour:int,calls:int,answered:int}>}
 * @phpstan-type Filters array{projectId?:string,sessionId?:string,direction?:Direction,upstream?:'linked_device'|'cloud_api',outcome?:Outcome,since?:string|\DateTimeInterface,until?:string|\DateTimeInterface}
 * @phpstan-type StatsParams array{projectId?:string,sessionId?:string,direction?:Direction,upstream?:'linked_device'|'cloud_api',outcome?:Outcome,since?:string|\DateTimeInterface,until?:string|\DateTimeInterface,groupBy?:'day'|'hour'|'session'|'outcome',timezone?:string}
 * @phpstan-type ListParams array{projectId?:string,sessionId?:string,direction?:Direction,upstream?:'linked_device'|'cloud_api',outcome?:Outcome,since?:string|\DateTimeInterface,until?:string|\DateTimeInterface,limit?:int,cursor?:string}
 * @phpstan-type ExportParams array{projectId?:string,sessionId?:string,direction?:Direction,upstream?:'linked_device'|'cloud_api',outcome?:Outcome,since?:string|\DateTimeInterface,until?:string|\DateTimeInterface,limit?:int,cursor?:string,format?:'csv'|'ndjson'}
 * @phpstan-type ExportPage array{format:'csv'|'ndjson',body:string,nextCursor:?string}
 */
final class CallRecordModels
{
}
