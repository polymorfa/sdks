<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-import-type FailureReason from CampaignContractModels
 * @phpstan-type TrackedLink array{key:string,url:string}
 * @phpstan-type VariableBinding array{source?:string,fallback?:string}
 * @phpstan-type VariableMapping array<int|string,VariableBinding>
 * @phpstan-type CampaignMessage array{version?:2,source?:string,media?:array{kind:'image'|'video'|'audio'|'document',url:string,filename?:string,caption?:string,...<string,mixed>},buttons?:list<array{kind:'reply'|'link'|'call',label:string,url?:string,phone?:string,...<string,mixed>}>,footer?:string,delayAfterSec?:int,...<string,mixed>}
 * @phpstan-type MessagingLaunch array{scheduledAt?:int|float,skipMissingVariables?:bool}
 * @phpstan-type PlatformLaunch array{projectId:string,scheduledAt?:int|float,skipMissingVariables?:bool}
 * @phpstan-type PlatformOperation array{id:string,status:string,operationId:string,...<string,mixed>}
 * @phpstan-type RecipientParams array{status?:Status,reason?:FailureReason,cursor?:string,limit?:int}
 * @phpstan-type PlatformRecipientParams array{projectId:string,status?:Status,reason?:FailureReason,cursor?:string,limit?:int}
 * @phpstan-type Day 'monday'|'tuesday'|'wednesday'|'thursday'|'friday'|'saturday'|'sunday'
 * @phpstan-type WindowInput array{timeZone?:string,days:list<Day>,hours:list<array{start:string,end:string}>,recipientTimeZone?:bool,timeZoneVariable?:string}
 * @phpstan-type Window array{timeZone:string,days:list<Day>,hours:list<array{start:string,end:string}>,recipientTimeZone:bool,timeZoneVariable:string}
 * @phpstan-type Criterion 'delivery'|'read'|'reply'
 * @phpstan-type Blueprint array{version:2,source:string,...<string,mixed>}
 * @phpstan-type Variation array{key:string,weight:int,blueprint:Blueprint}
 * @phpstan-type Variant array{key:string,label:string,weight:int,blueprint:Blueprint}
 * @phpstan-type Strategy array{winnerCriterion:Criterion,holdoutPercent:int,testSlicePercent?:int,autoPromote:true,testWindowMinutes:int}
 * @phpstan-type Outcome array{state:'promoted',winnerKey:string}|array{state:'inconclusive',reason:'insufficient_evidence'}
 * @phpstan-type Experiment array{criterion:Criterion,outcome:Outcome|null,holdoutCount:int,reserveCount:int,variants:list<array{key:string,label:string,weight:int,assigned:int,sent:int,delivered:int,read:int,replied:int,outcomeRate:int|float}>}
 * @phpstan-type FollowUpMessage array{type:'text',text:string}|array{type:'template',templateId:string}
 * @phpstan-type FollowUp array{delaySeconds?:int,expirySeconds?:int,message:FollowUpMessage}
 * @phpstan-type FollowUpStatus 'waiting_receipt'|'scheduled'|'sending'|'sent'|'cancelled'|'expired'|'failed'|'outcome_unknown'
 * @phpstan-type FollowUpSummary array{id:string,numberId:string,status:FollowUpStatus,anchorKind:'delivered'|'read'|null,firstDeliveredAt:int|float|null,firstReadAt:int|float|null,dueAt:int|float|null,expiresAt:int|float,sentAt:int|float|null,deliveredAt:int|float|null,readAt:int|float|null,repliedAt:int|float|null,reason:?string,commandId:?string}
 * @phpstan-type FollowUpReport array{total:int,waiting:int,scheduled:int,sending:int,sent:int,delivered:int,read:int,replied:int,cancelled:int,expired:int,failed:int,unknown:int,nextDueAt:int|float|null}
 * @phpstan-type Campaign array{id:string,name:string,status:string,templateId:?string,recipientListId:?string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,scheduledAt:int|float|null,launchedAt:int|float|null,completedAt:int|float|null,createdAt:int|float,updatedAt:int|float,sendWindow:Window|null,trackedLinks:list<TrackedLink>,variableMapping?:VariableMapping|null,composerBlueprint?:mixed,messages?:mixed,audienceRef?:mixed,senderConfig?:mixed,complianceConfig?:mixed,variants?:list<Variant>|null,variantStrategy?:Strategy|null,experimentOutcome:Outcome|null,messageVariations?:list<Variation>|null,followUp:FollowUp|null}
 * @phpstan-type CampaignOperation array{id:string,name:string,status:string,templateId:?string,recipientListId:?string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,scheduledAt:int|float|null,launchedAt:int|float|null,completedAt:int|float|null,createdAt:int|float,updatedAt:int|float,sendWindow:Window|null,trackedLinks:list<TrackedLink>,variableMapping?:VariableMapping|null,composerBlueprint?:mixed,messages?:mixed,audienceRef?:mixed,senderConfig?:mixed,complianceConfig?:mixed,variants?:list<Variant>|null,variantStrategy?:Strategy|null,experimentOutcome:Outcome|null,messageVariations?:list<Variation>|null,operationId:string,followUp:FollowUp|null}
 * @phpstan-type CampaignStop array{id:string,name:string,status:string,templateId:?string,recipientListId:?string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,scheduledAt:int|float|null,launchedAt:int|float|null,completedAt:int|float|null,createdAt:int|float,updatedAt:int|float,sendWindow:Window|null,trackedLinks:list<TrackedLink>,variableMapping?:VariableMapping|null,composerBlueprint?:mixed,messages?:mixed,audienceRef?:mixed,senderConfig?:mixed,complianceConfig?:mixed,variants?:list<Variant>|null,variantStrategy?:Strategy|null,experimentOutcome:Outcome|null,messageVariations?:list<Variation>|null,operationId:?string,followUp:FollowUp|null}
 * @phpstan-type RecipientInput array{phone:string,variables?:array<int|string,string|int|float|bool>}
 * @phpstan-type Status 'queued'|'sending'|'sent'|'delivered'|'read'|'failed'|'skipped'
 * @phpstan-type Recipient array{id:string,phone:string,variables:array<int|string,mixed>,variantKey:?string,status:Status,attempts:int,lastError:?string,externalMessageId:?string,queuedAt:int|float,sentAt:int|float|null,deliveredAt:int|float|null,readAt:int|float|null,failedAt:int|float|null,respondedAt:int|float|null,failureReason:FailureReason|null,nextMessageAt:int|float|null,messagesSent:int<0,max>,sequenceError:string|null,followUp:FollowUpSummary|null}
 * @phpstan-type InvalidRow array{row:int,reason:'missing_phone'|'invalid_phone'|'invalid_variables'|'invalid_entry'}
 * @phpstan-type AddedRecipients array{campaignId:string,added:int,recipientCount:int,duplicateCount:int,invalidCount:int,invalidRows:list<InvalidRow>}
 * @phpstan-type CreateInput array{name:string,templateId?:string,variableMapping?:VariableMapping,trackedLinks?:list<TrackedLink>|null,recipientListId?:string,senderConfig?:array<string,mixed>,scheduledAt?:int|float,sendWindow?:WindowInput|null,recipients?:list<RecipientInput>,messageVariations?:list<Variation>|null,variants?:list<Variant>|null,variantStrategy?:Strategy|null,followUp?:FollowUp|null}
 * @phpstan-type UpdateInput array{name?:string,templateId?:string|null,variableMapping?:VariableMapping|null,trackedLinks?:list<TrackedLink>|null,recipientListId?:?string,senderConfig?:array<string,mixed>,scheduledAt?:int|float|null,sendWindow?:WindowInput|null,messageVariations?:list<Variation>|null,variants?:list<Variant>|null,variantStrategy?:Strategy|null,followUp?:FollowUp|null}
 * @phpstan-type PlatformCreate array{projectId:string,name:string,templateId?:string,variableMapping?:VariableMapping,trackedLinks?:list<TrackedLink>|null,recipientListId?:string,senderConfig?:array<string,mixed>,scheduledAt?:int|float,sendWindow?:WindowInput|null,recipients?:list<RecipientInput>,recipientCount?:int,composerBlueprint?:mixed,messagesArray?:list<CampaignMessage>,audienceRef?:mixed,complianceConfig?:mixed,variants?:list<Variant>,variantStrategy?:Strategy,messageVariations?:list<Variation>,followUp?:FollowUp|null}
 * @phpstan-type PlatformUpdate array{projectId?:never,id?:never,name?:string,templateId?:string|null,variableMapping?:VariableMapping|null,trackedLinks?:list<TrackedLink>|null,recipientListId?:?string,senderConfig?:array<string,mixed>,scheduledAt?:int|float|null,sendWindow?:WindowInput|null,messageVariations?:list<Variation>|null,variants?:list<Variant>|null,variantStrategy?:Strategy|null,followUp?:FollowUp|null,...<string,mixed>}
 * @phpstan-type PlatformCampaign array{id:string,name:string,status:string,templateId:?string,recipientListId:?string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,scheduledAt:int|float|null,launchedAt:int|float|null,completedAt:int|float|null,createdAt:int|float,updatedAt:int|float,sendWindow:Window|null,trackedLinks:list<TrackedLink>,variableMapping?:VariableMapping|null,composerBlueprint?:mixed,messages?:mixed,audienceRef?:mixed,senderConfig?:mixed,complianceConfig?:mixed,variants?:list<Variant>|null,variantStrategy?:Strategy|null,experimentOutcome:Outcome|null,messageVariations?:list<Variation>|null,followUp:FollowUp|null,...<string,mixed>}
 * @phpstan-type Analytics array{campaignId:string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,respondedCount:int,responseRate:int|float,experiment:Experiment|null,averageResponseTimeMs:int|float|null,minResponseTimeMs:int|float|null,maxResponseTimeMs:int|float|null,followUps:FollowUpReport}
 * @phpstan-type PlatformAnalytics array{campaignId:string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,respondedCount:int,responseRate:int|float,experiment:Experiment|null,averageResponseTimeMs:int|float|null,minResponseTimeMs:int|float|null,maxResponseTimeMs:int|float|null,followUps:FollowUpReport}
 * @phpstan-type ConversionValue array{amountMinor:int,currency:string}
 * @phpstan-type ConversionInput array{projectId:string,recipientId:string,eventId:string,eventType:string,occurredAt:string,value?:ConversionValue|null}
 * @phpstan-type Conversion array{id:string,campaignId:string,recipientId:?string,eventType:string,occurredAt:string,value:ConversionValue|null,evidence:'customer_reported',attribution:array{outcome:'attributed'|'outside_window'|'not_sent'|'opted_out',touchAt:?string,windowDays:7},recordedAt:string,replayed:bool}
 * @phpstan-type ConversionReport array{campaignId:string,model:array{touch:'recipient_sent',windowDays:7,correlation:'explicit_recipient'},sentCount:int,conversions:array{total:int,attributed:int,outsideWindow:int,notSent:int,optedOut:int},convertedRecipients:int,conversionRate:int|float,values:list<array{currency:string,evidence:'customer_reported',attributedConversions:int,attributedAmountMinor:string,unattributedConversions:int,unattributedAmountMinor:string}>}
 */
final class CampaignModels
{
    private function __construct()
    {
    }
}
