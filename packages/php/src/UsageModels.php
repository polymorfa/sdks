<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Meter 'call.duration'|'call.cloud_pulses'|'campaign.call'|'tts.characters'|'tts.seconds'|'stt.seconds'|'agent.seconds'|'agent.tokens'|'agent.provider_cost'|'channels.peak'|'storage.byte_days'
 * @phpstan-type Unit 'second'|'pulse'|'call'|'character'|'token'|'provider_unit'|'channel'|'byte_day'
 * @phpstan-type KeySource 'none'|'managed'|'customer'
 * @phpstan-type Record array{id:string,meter:Meter,quantity:int|float,unit:Unit,dimensions:array<string,string|int|float|bool>,keySource:KeySource,sourceKind:'call'|'attempt'|'flow_run'|'conversation'|'asset'|'team',sourceId:string,projectId:?string,session:?string,occurredAt:string,recordedAt:string,revision:int,pricingState:'unpriced'|'priced'|'waived'|'settled',rateCard:array{id:string,version:int}|null,pricedCredits:int|float|null}
 * @phpstan-type RecordPage array{records:list<Record>,nextCursor:?string}
 * @phpstan-type MeterTotal array{meter:Meter,unit:Unit,keySource:KeySource,quantity:int|float,records:int}
 * @phpstan-type Summary array{period:string,start:string,end:string,projectId:?string,session:?string,billingEnabled:bool,meters:list<MeterTotal>,numbers:list<array{session:string,projectId:?string,meters:list<MeterTotal>}>,numbersTruncated:bool}
 * @phpstan-type GateKey 'calls.outbound_monthly'|'voice.campaigns'|'voice.campaigns.recipients'|'voice.campaigns.calls_monthly'|'voice.channels.concurrent'|'voice.audio_library'|'voice.audio_library.assets'|'voice.flows'|'voice.agents.elevenlabs'|'voice.agents.openai_realtime'|'voice.providers.managed'|'voice.providers.customer_key'|'voice.agent_minutes_monthly'|'voice.tts_characters_monthly'|'voice.stt_minutes_monthly'|'voice.storage.recordings'|'voice.storage.transcripts'
 * @phpstan-type Gate array{key:GateKey,kind:'capability'|'quota'|'limit'|'concurrency',subject:'team'|'number'|'project'|'campaign',mode:'off'|'record'|'enforce',active:bool,limit:int|float|null,used:int|float|null,unit:Unit|'count'|'minute'|null,overLimit:?bool,decisions:array{wouldBlock:int,blocked:int,evaluationError:int}}
 * @phpstan-type GateList array{session:?string,gates:list<Gate>}
 * @phpstan-type SummaryParams array{projectId?:string,session?:string,period?:string}
 * @phpstan-type RecordParams array{projectId?:string,session?:string,period?:string,callId?:string,meter?:Meter,limit?:int,cursor?:string}
 * @phpstan-type IterateParams array{projectId?:string,session?:string,period?:string,callId?:string,meter?:Meter,limit?:int}
 * @phpstan-type GateParams array{projectId?:string,session?:string}
 */
final class UsageModels
{
    private function __construct()
    {
    }
}
