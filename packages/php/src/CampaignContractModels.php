<?php

declare(strict_types=1);

namespace Polymorfa;

/**
 * @phpstan-type ReplyButton array{id:string,text:string}
 * @phpstan-type ReplyRow array{id:string,title:string,description?:string}
 * @phpstan-type ReplySend array{kind:'text',text:string}|array{kind:'buttons',body:string,footer?:string,buttons:list<ReplyButton>}|array{kind:'list',body:string,buttonText:string,footer?:string,rows:list<ReplyRow>}|array{kind:'flow_form',flowId:string,body:string,buttonText:string,footer?:string,screen:string}
 * @phpstan-type ReplyMatch array{kind:'choice',replyKind:'button'|'list',id:string}|array{kind:'keyword',value:string}|array{kind:'flow_submission'}
 * @phpstan-type ReplyNode array{id:string,send?:ReplySend,edges:list<array{match:ReplyMatch,to:string}>}
 * @phpstan-type ReplyDefinition array{entryNodeId:string,nodes:list<ReplyNode>}
 * @phpstan-type ReplyCreate array{name:string,definition:ReplyDefinition,flowKey?:string,revision?:int}
 * @phpstan-type PlatformReplyCreate array{projectId:string,name:string,definition:ReplyDefinition,flowKey?:string,revision?:int}
 * @phpstan-type ReplyFlow array{id:string,flowKey:string,revision:int,name:string,definition:ReplyDefinition,createdAt:int}
 * @phpstan-type ProjectParams array{projectId:string}
 * @phpstan-type TestSendInput array{sessionId:string,to:string,sampleRecipientId?:string,variables?:array<string|int,string|int|float|bool>}
 * @phpstan-type PlatformTestSendInput array{projectId:string,sessionId:string,to:string,sampleRecipientId?:string,variables?:array<string|int,string|int|float|bool>}
 * @phpstan-type TestSend array{id:string,campaignId:string,status:'sent',from:array{sessionId:string,phone:string},to:string,messageId:string|null,variables:array<string|int,string>,createdAt:int}
 * @phpstan-type AssignmentInput array{replyFlowId:string|null}
 * @phpstan-type PlatformAssignmentInput array{projectId:string,replyFlowId:string|null}
 * @phpstan-type Assignment array{campaignId:string,replyFlowId:string|null}
 * @phpstan-type LinkReport array{key:string,url:string,uniqueOpens:int,totalOpens:int}
 * @phpstan-type FailureReason 'opted_out'|'cold_held'|'campaign_cancelled'|'invalid_recipient'|'session_not_connected'|'ack_timeout'|'blocked_by_safety'|'send_failed'|'missing_variable'|'frequency_cap'|'other'
 * @phpstan-type RecipientStatus 'queued'|'sending'|'sent'|'delivered'|'read'|'failed'|'skipped'
 * @phpstan-type ExportParams array{status?:RecipientStatus,reason?:FailureReason,cursor?:string,limit?:int}
 * @phpstan-type PlatformExportParams array{projectId:string,status?:RecipientStatus,reason?:FailureReason,cursor?:string,limit?:int}
 * @phpstan-type Approval array{id:string,campaignId:string,action:'launch'|'resume'|'reschedule',status:'pending'|'approved'|'rejected'|'superseded'|'expired',reasons:list<'audience_threshold'|'agent_request'>,recipientCount:int,scheduledAt:int|null,requestedBy:array{type:string,id:string},requestedAt:int,expiresAt:int,decidedBy:string|null,decidedAt:int|null,operationId:string|null}
 * @phpstan-type Settings array{launchApproval:array{recipientThreshold:int|null}}
 * @phpstan-type RetargetOutcome 'delivered'|'not_delivered'|'read'|'not_read'|'replied'|'not_replied'|'failed'
 * @phpstan-type RetargetInput array{name:string,campaignId:string,outcome:RetargetOutcome,projectId?:string}
 * @phpstan-type RetargetResult array{id:string,name:string,source:'campaign',recipientCount:int,fileId:string|null,columns:list<string>|null,sampleRow:array<string|int,string>|null,mapping:array<string|int,mixed>|null,createdAt:int,updatedAt:int,sourceCampaignId:string,outcome:RetargetOutcome,matchedCount:int,optedOutCount:int}
 * @phpstan-type Locale 'en'|'pt-BR'|'es'
 * @phpstan-type StopSettings array{teamId:string,enabled:bool,locale:Locale|null,revision:int,textRevision:1,acknowledgement:string|null,updatedAt:int|null}
 * @phpstan-type StopInput array{teamId:string,revision:int,enabled:true,locale:Locale}|array{teamId:string,revision:int,enabled:false,locale:Locale|null}
 * @phpstan-type StopSummary array{enabled:bool,counts:array{queued:int,admitted:int,completed:int,failed:int,unknown:int}}
 */
final class CampaignContractModels
{
}
