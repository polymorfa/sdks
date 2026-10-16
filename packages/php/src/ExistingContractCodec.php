<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Response structure only. Request quotas never apply to normalized returns. */
final class ExistingContractCodec
{
    public static function matches(mixed $value, string $model): bool
    {
        if (!CampaignContractCodec::matches($value, self::model($model))) {
            return false;
        }
        if (in_array($model, ['recipients','platformRecipients'], true)) {
            foreach ($value as $recipient) {
                if ($recipient->messagesSent < 0) {
                    return false;
                }
            }
        }
        return true;
    }
    public static function model(string $model): mixed
    {
        $o = static fn (array $fields, array $optional = []): array => ['object' => $fields,'optional' => $optional];
        $n = static fn (mixed $s): array => ['nullable' => $s];
        $l = static fn (mixed $s): array => ['list' => $s];
        $e = static fn (array $v): array => ['enum' => $v];
        $map = static fn (mixed $s): array => ['map' => $s];
        $outcome = ['union' => [$o(['state' => $e(['promoted']),'winnerKey' => 'string']),$o(['state' => $e(['inconclusive']),'reason' => $e(['insufficient_evidence'])])]];
        $blueprint = $o(['version' => $e([2]),'source' => 'string']);
        $variation = $o(['key' => 'string','weight' => 'int','blueprint' => $blueprint]);
        $variant = $o(['key' => 'string','label' => 'string','weight' => 'int','blueprint' => $blueprint]);
        $strategy = $o(['winnerCriterion' => $e(['delivery','read','reply']),'holdoutPercent' => 'int','testSlicePercent' => 'int','autoPromote' => $e([true]),'testWindowMinutes' => 'int'], ['testSlicePercent']);
        $followUp = $o(['delaySeconds' => 'int','expirySeconds' => 'int','message' => ['union' => [$o(['type' => $e(['text']),'text' => 'string']),$o(['type' => $e(['template']),'templateId' => 'string'])]]], ['delaySeconds','expirySeconds']);
        $window = $o(['timeZone' => 'string','days' => $l($e(['monday','tuesday','wednesday','thursday','friday','saturday','sunday'])),'hours' => $l($o(['start' => 'string','end' => 'string'])),'recipientTimeZone' => 'bool','timeZoneVariable' => 'string']);
        $campaign = $o(['id' => 'string','name' => 'string','status' => 'string','templateId' => $n('string'),'recipientListId' => $n('string'),'recipientCount' => 'int','sentCount' => 'int','deliveredCount' => 'int','readCount' => 'int','failedCount' => 'int','skippedCount' => 'int','scheduledAt' => $n('number'),'launchedAt' => $n('number'),'completedAt' => $n('number'),'createdAt' => 'number','updatedAt' => 'number','sendWindow' => $n($window),'trackedLinks' => $l($o(['key' => 'string','url' => 'string'])),'variableMapping' => $n($map($o(['source' => 'string','fallback' => 'string'], ['source','fallback']))),'experimentOutcome' => $n($outcome),'followUp' => $n($followUp),'variants' => $n($l($variant)),'variantStrategy' => $n($strategy),'messageVariations' => $n($l($variation))], ['variableMapping','variants','variantStrategy','messageVariations']);
        if ($model === 'campaignOperation' || $model === 'campaignStop') {
            $campaign['object']['operationId'] = $model === 'campaignStop' ? $n('string') : 'string';
        }
        $followSummary = $o(['id' => 'string','numberId' => 'string','status' => $e(['waiting_receipt','scheduled','sending','sent','cancelled','expired','failed','outcome_unknown']),'anchorKind' => $n($e(['delivered','read'])),'firstDeliveredAt' => $n('number'),'firstReadAt' => $n('number'),'dueAt' => $n('number'),'expiresAt' => 'number','sentAt' => $n('number'),'deliveredAt' => $n('number'),'readAt' => $n('number'),'repliedAt' => $n('number'),'reason' => $n('string'),'commandId' => $n('string')]);
        $recipient = $o(['id' => 'string','phone' => 'string','variables' => $map('any'),'variantKey' => $n('string'),'status' => $e(['queued','sending','sent','delivered','read','failed','skipped']),'attempts' => 'int','lastError' => $n('string'),'externalMessageId' => $n('string'),'queuedAt' => 'number','sentAt' => $n('number'),'deliveredAt' => $n('number'),'readAt' => $n('number'),'failedAt' => $n('number'),'respondedAt' => $n('number'),'failureReason' => $n($e(['opted_out','cold_held','campaign_cancelled','invalid_recipient','session_not_connected','ack_timeout','blocked_by_safety','send_failed','missing_variable','other'])),'nextMessageAt' => $n('number'),'messagesSent' => 'int','sequenceError' => $n('string'),'followUp' => $n($followSummary)]);
        $followReport = $o(['total' => 'int','waiting' => 'int','scheduled' => 'int','sending' => 'int','sent' => 'int','delivered' => 'int','read' => 'int','replied' => 'int','cancelled' => 'int','expired' => 'int','failed' => 'int','unknown' => 'int','nextDueAt' => $n('number')]);
        $experiment = $o(['criterion' => $e(['delivery','read','reply']),'outcome' => $n($outcome),'holdoutCount' => 'int','reserveCount' => 'int','variants' => $l($o(['key' => 'string','label' => 'string','weight' => 'int','assigned' => 'int','sent' => 'int','delivered' => 'int','read' => 'int','replied' => 'int','outcomeRate' => 'number']))]);
        $analytics = $o(['campaignId' => 'string','recipientCount' => 'int','sentCount' => 'int','deliveredCount' => 'int','readCount' => 'int','failedCount' => 'int','skippedCount' => 'int','respondedCount' => 'int','responseRate' => 'number','averageResponseTimeMs' => $n('number'),'minResponseTimeMs' => $n('number'),'maxResponseTimeMs' => $n('number'),'experiment' => $n($experiment),'followUps' => $followReport]);
        $platformRecipient = $recipient;
        $platformRecipient['object']['nextMessageAt'] = $n('int');
        return match ($model) {
            'campaign','campaignOperation','campaignStop' => $campaign,
            'campaigns' => $l($campaign),
            'nullableCampaign' => $n($campaign),
            'platformOperation' => $o(['id' => 'string','status' => 'string','operationId' => 'string']),
            'campaignAnalytics' => $analytics,
            'recipients' => $l($recipient),
            'platformRecipients' => $l($platformRecipient),
            'addedRecipients' => $o(['campaignId' => 'string','added' => 'int','recipientCount' => 'int','duplicateCount' => 'int','invalidCount' => 'int','invalidRows' => $l($o(['row' => 'int','reason' => $e(['missing_phone','invalid_phone','invalid_variables','invalid_entry'])]))]),
            'groupCapabilities' => $o(['status' => $e(['synced','unknown']),'syncedAt' => $n('string'),'checkedAt' => $n('string'),'capabilities' => $l($o(['key' => $e(['polls.endTime','polls.hideVoters','polls.creatorEdit']),'kind' => $e(['feature']),'unit' => $e([null]),'value' => $n('bool'),'source' => $n($e(['server','client_default']))]))]),
            'testingPhone' => $o(['session' => 'string','phone' => 'string','online' => 'bool','devices' => $l($o(['deviceId' => 'int']))]),
            'testingSend' => $o(['session' => 'string','to' => 'string','messageId' => $n('string')]),
            'testingUnlink' => $o(['session' => 'string','deviceId' => 'int','unlinked' => $e([true])]),
            'logs' => $l($o(['id' => 'string','projectId' => 'string','createdAt' => 'string','method' => 'string','route' => 'string','status' => $n('int'),'durationMs' => $n('number'),'result' => $e(['success','failure']),'source' => $e(['api','mcp']),'requestId' => $n('string'),'traceId' => $n('string'),'errorCode' => $n('string'),'mcpTool' => $n('string'),'credential' => $n($o(['type' => $e(['team_key','project_token','client_token']),'id' => $n('string'),'last4' => $n('string')]))])),
            'historyRetry' => $o(['requestId' => ['string' => [1,PHP_INT_MAX]],'status' => $e(['requested'])]),
            'historyDelete' => $o(['status' => $e(['deleted'])]),
            'configuration' => SessionDeliveryValidation::responseModel(),
            'session' => $o(['sessionId' => 'string','name' => 'string','tenantId' => 'string','type' => $e(['linked_device','cloud_api']),'testMode' => 'bool','status' => 'string','createdAt' => 'string','updatedAt' => 'string','signalMode' => $e(['standard','zero_knowledge']),'configuration' => SessionDeliveryValidation::responseModel()], ['signalMode','configuration']),
            'object' => $o([]),
            default => throw new \LogicException('Unknown existing contract model.'),
        };
    }
}
