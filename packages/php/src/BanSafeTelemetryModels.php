<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type Band 'good'|'fair'|'poor'|'failing'|'unknown'
 * @phpstan-type HealthState 'healthy'|'limited'|'restricted'|'banned'
 * @phpstan-type Source 'rules_v1'|'ml_model'|'unavailable'
 * @phpstan-type Reliability 'rules_based'|'validated'|'unavailable'
 * @phpstan-type Unavailable 'no_active_model'|'invalid_active_model'|'insufficient_fresh_features'
 * @phpstan-type Rung 'none'|'notify'|'throttle'|'block_cold'|'suspend'
 * @phpstan-type Appeal 'none'|'requested'|'granted'|'denied'
 * @phpstan-type Group 'direct_condition'|'delivery'|'connection'|'conduct'|'cadence'
 * @phpstan-type Probabilities array{healthy:int|float,limited:int|float,restricted:int|float,banned:int|float}
 * @phpstan-type Explanation array{penalties:array{conduct:int|float,delivery:int|float,connection:int|float,restriction:int|float,total:int|float},factors:list<array{group:Group,key:string,penalty:int|float,observedValue:int|float,sampleSize:int}>,measuredGroups:list<Group>,missingGroups:list<Group>}
 * @phpstan-type Observed array{state:HealthState,observedAt:string,source:'account_check'|'restriction_event'}
 * @phpstan-type Enforcement array{rung:Rung,previousRung:Rung,organizationFloor:Rung,reason:string,source:'automatic'|'operator',throughputPerMinute:int|float|null,blocksUnsolicited:bool,suspended:bool,startedAt:string,eligibleLiftAt:?string,exitProgress:int|float,blockingFindings:list<string>,operatorHold:bool,appealState:Appeal,state:'applied'|'applying'}
 * @phpstan-type Warmup array{enabled:bool,tenureSource:'history'|'link'|'plan'|null,tenureDay:int,allowance:?int,sentToday:?int,resetsAt:?string,curve:list<array{day:int,allowance:int}>}
 * @phpstan-type NumberHealth array{health:int|float|null,band:Band,healthSource:Source,healthEstimatorVersion:?string,healthModelVersion:?string,healthEvaluatedAt:?string,healthFeatureCoverage:int|float|null,healthReliability:Reliability,healthUnavailableReason:Unavailable|null,healthProbabilities:Probabilities|null,mostLikelyHealthState:HealthState|null,healthExplanation:Explanation|null,observedAccountState:Observed|null,sessionId:string,session:string,phoneNumber:string,projectId:string,enforcement:Enforcement|null}
 * @phpstan-type NumberDetail array{health:int|float|null,band:Band,healthSource:Source,healthEstimatorVersion:?string,healthModelVersion:?string,healthEvaluatedAt:?string,healthFeatureCoverage:int|float|null,healthReliability:Reliability,healthUnavailableReason:Unavailable|null,healthProbabilities:Probabilities|null,mostLikelyHealthState:HealthState|null,healthExplanation:Explanation|null,observedAccountState:Observed|null,sessionId:string,session:string,phoneNumber:string,projectId:string,enforcement:Enforcement|null,warmup:Warmup,findings:list<Finding>,liftRequires:?string,appealState:Appeal}
 * @phpstan-type HealthPoint array{health:int|float|null,band:Band|null,healthSource:Source,healthEstimatorVersion:?string,healthModelVersion:?string,healthEvaluatedAt:string,healthFeatureCoverage:int|float|null,healthReliability:Reliability,healthUnavailableReason:Unavailable|null,healthProbabilities:Probabilities|null,mostLikelyHealthState:HealthState|null,healthExplanation:Explanation|null,observedAccountState:Observed|null}
 * @phpstan-type Finding array{id:?string,key:string,title:string,summary:string,fix:string,status:'open'|'acknowledged'|'resolved'|'not_measured',severity:'info'|'warning'|'critical'|null,occurrences:int,reopenedCount:int,evidence:array<string,int|float>,sessionId:string,session:string,phoneNumber:string,firstSeenAt:?string,lastSeenAt:?string,acknowledgedAt:?string,acknowledgedBy:?string,acknowledgementNote:?string,snoozedUntil:?string,resolvedAt:?string,resolveReason:'clean'|'key_retired'|'number_removed'|'stale'|null}
 * @phpstan-type EnforcementSummary array{health:int|float|null,band:Band,healthSource:Source,healthEstimatorVersion:?string,healthModelVersion:?string,healthEvaluatedAt:?string,healthFeatureCoverage:int|float|null,healthReliability:Reliability,healthUnavailableReason:Unavailable|null,healthProbabilities:Probabilities|null,mostLikelyHealthState:HealthState|null,healthExplanation:Explanation|null,observedAccountState:Observed|null,sessionId:string,session:string,phoneNumber:string,projectId:string,rung:Rung,previousRung:Rung,organizationFloor:Rung,reason:string,source:'automatic'|'operator',throughputPerMinute:int|float|null,blocksUnsolicited:bool,suspended:bool,enforcement?:Enforcement|null,blockingFindings:list<string>,startedAt:string,eligibleLiftAt:?string,liftRequires:string,operatorHold:bool,appealState:Appeal,state:'applied'|'applying'}
 * @phpstan-type Incident array{id:string,sessionId:string,session:string,phoneNumber:string,projectId:string,kind:'cap_warning'|'cap_reached'|'timelock'|'temporary_ban'|'permanent_ban'|'connect_blocked'|'customer_report',source:'runtime'|'customer',resolution:string,ambiguous:bool,startedAt:string,endsAt:?string,closedAt:?string,closedBy:?string,claimId:?string,note:?string,reportedBy:?string,createdAt:string}
 * @phpstan-type ClaimStatus 'filed'|'under_review'|'approved'|'denied'|'paid'|'reversed'
 * @phpstan-type Claim array{id:string,incidentId:string,sessionId:string,session:string,phoneNumber:string,projectId:string,status:ClaimStatus,verdict:'other_device'|'customer_conduct'|'shared_network'|'ours'|'inconclusive',windowStart:string,windowEnd:string,measuredCents:int|float,capCents:int|float,amountCents:int|float,evidence:array{attributionRuleVersion:?int,windowDays:int,deviceEvidence:bool,otherDevices:int,restrictedInWindow:bool,criticalFindingDays:int,sharedConnection:bool,measuredHours:int|float},summary:string,reason:string,decidedAt:?string,paidAt:?string,createdAt:string}
 * @phpstan-type SignalDefinition array{key:string,label:string,group:string,kind:'number'|'boolean'|'enum'|'histogram'|'code_counts',unit:'count'|'milliseconds'|'unix_milliseconds'|'ratio'|'none',description:string}
 * @phpstan-type Signal array{key:string,label:string,group:string,kind:'number'|'boolean'|'enum'|'histogram'|'code_counts',unit:'count'|'milliseconds'|'unix_milliseconds'|'ratio'|'none',description:string,measured:bool,value:int|float|bool|string|list<int|float>|null,sampleSize:?int,codes:list<array{code:int,count:int}>|null}
 * @phpstan-type CollectionStatus array{state:'fresh'|'stale'|'not_collected'|'unsupported',latestFlushedAt:?string,latestReceivedAt:?string,freshUntil:?string,recordVersion:?int,collectorVersion:?int,partial:?bool,droppedRecords:?int}
 * @phpstan-type Snapshot array{bucketStart:string,flushedAt:string,receivedAt:string,partial:bool,recordVersion:?int,signals:list<Signal>}
 * @phpstan-type CollectionSession array{sessionId:string,session:string,projectId:string,collection:CollectionStatus}
 * @phpstan-type TelemetryDetail array{sessionId:string,session:string,projectId:string,collection:CollectionStatus,snapshot:Snapshot|null}
 * @phpstan-type ActionStatus 'pending'|'running'|'succeeded'|'failed'|'cancelled'
 * @phpstan-type HealthAction array{id:string,sessionId:string,session:string,projectId:string,mode:'apply'|'clear',action:'stop'|'slow_down'|'log_out'|'email'|'webhook',status:ActionStatus,health:int|float,threshold:int|float,healthSource:'rules_v1'|'ml_model',estimatorVersion:string,modelVersion:?string,slowDownMps:int|float|null,evaluatedAt:string,createdAt:string,completedAt:?string,outcome:'applied'|'cleared'|'notification_queued'|'superseded'|'expired'|'not_applied'|'delivery_failed'|null}
 * @phpstan-type ListParams array{projectId?:string,cursor?:string,limit?:int}
 */
final class BanSafeTelemetryModels
{
    private function __construct()
    {
    }
}
