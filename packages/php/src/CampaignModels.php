<?php

declare(strict_types=1);

namespace Polymorfa;

/**
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
 * @phpstan-type Campaign array{id:string,name:string,status:string,templateId:?string,recipientListId:?string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,scheduledAt:int|float|null,launchedAt:int|float|null,completedAt:int|float|null,createdAt:int|float,updatedAt:int|float,sendWindow:Window|null,composerBlueprint?:mixed,messages?:mixed,audienceRef?:mixed,senderConfig?:mixed,complianceConfig?:mixed,variants?:list<Variant>|null,variantStrategy?:Strategy|null,experimentOutcome?:Outcome|null,messageVariations?:list<Variation>|null}
 * @phpstan-type CampaignOperation array{id:string,name:string,status:string,templateId:?string,recipientListId:?string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,scheduledAt:int|float|null,launchedAt:int|float|null,completedAt:int|float|null,createdAt:int|float,updatedAt:int|float,sendWindow:Window|null,composerBlueprint?:mixed,messages?:mixed,audienceRef?:mixed,senderConfig?:mixed,complianceConfig?:mixed,variants?:list<Variant>|null,variantStrategy?:Strategy|null,experimentOutcome?:Outcome|null,messageVariations?:list<Variation>|null,operationId:string}
 * @phpstan-type CampaignStop array{id:string,name:string,status:string,templateId:?string,recipientListId:?string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,scheduledAt:int|float|null,launchedAt:int|float|null,completedAt:int|float|null,createdAt:int|float,updatedAt:int|float,sendWindow:Window|null,composerBlueprint?:mixed,messages?:mixed,audienceRef?:mixed,senderConfig?:mixed,complianceConfig?:mixed,variants?:list<Variant>|null,variantStrategy?:Strategy|null,experimentOutcome?:Outcome|null,messageVariations?:list<Variation>|null,operationId:?string}
 * @phpstan-type RecipientInput array{phone:string,variables?:array<string,string|int|float|bool>}
 * @phpstan-type Status 'queued'|'sending'|'sent'|'delivered'|'read'|'failed'|'skipped'
 * @phpstan-type Recipient array{id:string,phone:string,variables:array<string,mixed>,variantKey:?string,status:Status,attempts:int,lastError:?string,externalMessageId:?string,queuedAt:int|float,sentAt:int|float|null,deliveredAt:int|float|null,readAt:int|float|null,failedAt:int|float|null,respondedAt:int|float|null}
 * @phpstan-type InvalidRow array{row:int,reason:'missing_phone'|'invalid_phone'|'invalid_variables'|'invalid_entry'}
 * @phpstan-type AddedRecipients array{campaignId:string,added:int,recipientCount:int,duplicateCount:int,invalidCount:int,invalidRows:list<InvalidRow>}
 * @phpstan-type CreateInput array{name:string,templateId?:string,recipientListId?:string,senderConfig?:array<string,mixed>,scheduledAt?:int|float,sendWindow?:WindowInput|null,recipients?:list<RecipientInput>,messageVariations?:list<Variation>|null,variants?:list<Variant>|null,variantStrategy?:Strategy|null}
 * @phpstan-type UpdateInput array{name?:string,recipientListId?:?string,senderConfig?:array<string,mixed>,scheduledAt?:int|float|null,sendWindow?:WindowInput|null,messageVariations?:list<Variation>|null,variants?:list<Variant>|null,variantStrategy?:Strategy|null}
 * @phpstan-type PlatformCreate array{projectId:string,name:string,templateId?:string,recipientListId?:string,senderConfig?:array<string,mixed>,scheduledAt?:int|float,sendWindow?:WindowInput|null,recipients?:list<RecipientInput>,recipientCount?:int,composerBlueprint?:mixed,messagesArray?:mixed,audienceRef?:mixed,complianceConfig?:mixed,variants?:list<Variant>,variantStrategy?:Strategy,messageVariations?:list<Variation>}
 * @phpstan-type PlatformUpdate array{name?:string,recipientListId?:?string,senderConfig?:array<string,mixed>,scheduledAt?:int|float|null,sendWindow?:WindowInput|null,messageVariations?:list<Variation>|null,variants?:list<Variant>|null,variantStrategy?:Strategy|null,...<string,mixed>}
 * @phpstan-type PlatformCampaign array{id:string,name:string,status:string,templateId:?string,recipientListId:?string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,scheduledAt:int|float|null,launchedAt:int|float|null,completedAt:int|float|null,createdAt:int|float,updatedAt:int|float,sendWindow:Window|null,composerBlueprint?:mixed,messages?:mixed,audienceRef?:mixed,senderConfig?:mixed,complianceConfig?:mixed,variants?:list<Variant>|null,variantStrategy?:Strategy|null,experimentOutcome?:Outcome|null,messageVariations?:list<Variation>|null,...<string,mixed>}
 * @phpstan-type Analytics array{campaignId:string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,respondedCount:int,responseRate:int|float,experiment?:Experiment|null}
 * @phpstan-type PlatformAnalytics array{campaignId:string,recipientCount:int,sentCount:int,deliveredCount:int,readCount:int,failedCount:int,skippedCount:int,respondedCount:int,responseRate:int|float,experiment:Experiment|null,averageResponseTimeMs:int|float|null,minResponseTimeMs:int|float|null,maxResponseTimeMs:int|float|null}
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
