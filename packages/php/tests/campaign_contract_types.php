<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{AudienceProfileModels, CampaignContractModels, Client, MessagingClient, ProjectClient};

/**
 * @phpstan-import-type ReplyCreate from CampaignContractModels
 * @phpstan-import-type PlatformReplyCreate from CampaignContractModels
 * @phpstan-import-type ReplyFlow from CampaignContractModels
 * @phpstan-import-type TestSendInput from CampaignContractModels
 * @phpstan-import-type PlatformTestSendInput from CampaignContractModels
 * @phpstan-import-type TestSend from CampaignContractModels
 * @phpstan-import-type RetargetInput from CampaignContractModels
 * @phpstan-import-type StopInput from CampaignContractModels
 * @phpstan-import-type PutInput from AudienceProfileModels
 * @phpstan-import-type ImportInput from AudienceProfileModels
 */
final class CampaignContractTypes
{
    /** @param ReplyCreate $reply
     * @param PlatformReplyCreate $platformReply
     * @param TestSendInput $send
     * @param PlatformTestSendInput $platformSend
     * @param PutInput $put
     * @param ImportInput $import
     * @param RetargetInput $retarget
     * @param StopInput $stop */
    public static function consumer(MessagingClient $messaging, Client $team, ProjectClient $bound, string $id, string $project, string $customer, array $reply, array $platformReply, array $send, array $platformSend, array $put, array $import, array $retarget, array $stop): void
    {
        foreach ($messaging->campaigns->links('slug', $id)->data['data'] as $link) {
            self::text($link['key']);
            self::integer($link['uniqueOpens']);
        }
        self::sent($messaging->campaigns->testSend('slug', $id, $send)->data['data']);
        self::flow($messaging->campaigns->createReplyFlow('slug', $reply)->data['data']);
        self::flow($messaging->campaigns->getReplyFlow('slug', $id)->data['data']);
        self::nullableText($messaging->campaigns->setReplyFlow('slug', $id, ['replyFlowId' => null])->data['data']['replyFlowId']);
        self::text($messaging->campaigns->exportRecipients('slug', $id)->data->csv);
        self::nullableText($team->projects->getSignalCustody($project)->data['data']['signalModeDefault']);
        self::integer($team->projects->updateSignalCustody($project, ['expectedRevision' => 0, 'signalModeDefault' => 'zero_knowledge'])->data['data']['revision']);
        self::nullableText($team->customers->getSignalCustody($project, $customer)->data['data']['signalModeDefault']);
        self::integer($team->customers->updateSignalCustody($project, $customer, ['expectedRevision' => 0, 'signalModeDefault' => null])->data['data']['revision']);
        self::sent($team->campaigns->testSend($id, $platformSend)->data['data']);
        self::flow($team->campaigns->createReplyFlow($platformReply)->data['data']);
        self::flow($team->campaigns->getReplyFlow($id, ['projectId' => $project])->data['data']);
        self::nullableText($team->campaigns->setReplyFlow($id, ['projectId' => $project, 'replyFlowId' => null])->data['data']['replyFlowId']);
        self::nullableText($team->campaigns->exportRecipients($id, ['projectId' => $project])->data->nextCursor);
        foreach ($team->campaigns->links($id, ['projectId' => $project])->data['data'] as $link) {
            self::integer($link['totalOpens']);
        }
        foreach ($team->campaigns->listLaunchApprovals($id, ['projectId' => $project])->data['data'] as $approval) {
            self::nullableText($approval['decidedBy']);
        }
        self::nullableInteger($team->campaigns->getSettings()->data['data']['launchApproval']['recipientThreshold']);
        self::nullableText($team->audiences->createFromCampaign($retarget)->data['data']['fileId']);
        foreach ($team->audienceProfiles->list()->data['data'] as $profile) {
            self::integer($profile['revision']);
        }
        self::integer($team->audienceProfiles->retrieve('+15555555555')->data['data']['revision']);
        self::integer($team->audienceProfiles->put('+15555555555', $put)->data['data']['revision']);
        self::integer($team->audienceProfiles->delete('+15555555555', 1)->data['data']['revision']);
        foreach ($team->audienceProfiles->listConsent('+15555555555')->data['data'] as $consent) {
            self::boolean($consent['allowed']);
        }
        self::nullableInteger($team->audienceProfiles->imports->create($import)->data['data']['completedAt']);
        self::nullableInteger($team->audienceProfiles->imports->retrieve($id)->data['data']['completedAt']);
        self::nullableInteger($team->audienceProfiles->imports->cancel($id)->data['data']['completedAt']);
        self::nullableText($team->optOuts->getConfirmationSettings()->data['data']['locale']);
        self::nullableText($team->optOuts->updateConfirmationSettings($stop)->data['data']['locale']);
        self::integer($team->optOuts->getConfirmationSummary()->data['data']['counts']['unknown']);
        self::sent($bound->campaigns->testSend($id, $send)->data['data']);
        self::flow($bound->campaigns->createReplyFlow($reply)->data['data']);
        self::flow($bound->campaigns->getReplyFlow($id)->data['data']);
        self::nullableText($bound->campaigns->setReplyFlow($id, ['replyFlowId' => null])->data['data']['replyFlowId']);
        self::text($bound->campaigns->exportRecipients($id)->data->csv);
        foreach ($bound->campaigns->links($id)->data['data'] as $link) {
            self::text($link['url']);
        }
        foreach ($bound->campaigns->listLaunchApprovals($id)->data['data'] as $approval) {
            self::nullableText($approval['operationId']);
        }
        self::nullableText($bound->signalCustody->retrieve()->data['data']['signalModeDefault']);
        self::integer($bound->signalCustody->update(['expectedRevision' => 0, 'signalModeDefault' => 'standard'])->data['data']['revision']);
        self::nullableText($bound->signalCustody->retrieveCustomer($customer)->data['data']['signalModeDefault']);
        self::integer($bound->signalCustody->updateCustomer($customer, ['expectedRevision' => 0, 'signalModeDefault' => null])->data['data']['revision']);
    }
    /** @param ReplyFlow $value */
    private static function flow(array $value): void
    {
        self::integer($value['revision']);
    }
    /** @param TestSend $value */
    private static function sent(array $value): void
    {
        self::nullableText($value['messageId']);
    }
    private static function text(string $value): void
    {
    }
    private static function integer(int $value): void
    {
    }
    private static function boolean(bool $value): void
    {
    }
    private static function nullableText(?string $value): void
    {
    }
    private static function nullableInteger(?int $value): void
    {
    }
}
