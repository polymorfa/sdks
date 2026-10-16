<?php

declare(strict_types=1);

namespace Polymorfa\Tests;

use Polymorfa\{CampaignModels, Client, MessagingClient};

/**
 * @phpstan-import-type FollowUp from CampaignModels
 * @phpstan-import-type FollowUpMessage from CampaignModels
 * @phpstan-import-type FollowUpSummary from CampaignModels
 * @phpstan-import-type FollowUpReport from CampaignModels
 */
final class CampaignFollowUpTypes
{
    public static function consumer(MessagingClient $messaging, Client $platform): void
    {
        // Configuration timing is optional on requests and returned campaigns.
        $followUp = ['message' => ['type' => 'text','text' => 'Hi {{first_name}}']];
        $a = $messaging->campaigns->create('project', ['name' => 'Campaign','followUp' => $followUp]);
        $messaging->campaigns->update('project', 'campaign', ['followUp' => null]);
        $b = $platform->campaigns->create(['projectId' => 'project','name' => 'Campaign','followUp' => null]);
        $platform->campaigns->update('campaign', ['followUp' => ['message' => ['type' => 'template','templateId' => 'template']]], ['projectId' => 'project']);
        if (isset($a->data['data']['followUp'])) {
            self::config($a->data['data']['followUp']);
        }
        if (isset($b->data['data']['followUp'])) {
            self::config($b->data['data']['followUp']);
        }
        $messagingReport = $messaging->campaigns->analytics('project', 'campaign')->data['data'];
        self::report($messagingReport['followUps']);
        self::report($platform->campaigns->analytics('campaign', ['projectId' => 'project'])->data['data']['followUps']);
        foreach ($messaging->campaigns->listRecipients('project', 'campaign')->data['data'] as $recipient) {
            if (isset($recipient['followUp'])) {
                self::summary($recipient['followUp']);
            }
        }
        foreach ($platform->campaigns->recipients('campaign', ['projectId' => 'project'])->data['data'] as $recipient) {
            if (isset($recipient['followUp'])) {
                self::summary($recipient['followUp']);
            }
        }
    }

    /** @param FollowUp $config */
    private static function config(array $config): void
    {
        self::optionalInteger($config['delaySeconds'] ?? null);
        self::optionalInteger($config['expirySeconds'] ?? null);
        self::text(self::message($config['message']));
    }

    /** @param FollowUpMessage $message */
    private static function message(array $message): string
    {
        return $message['type'] === 'text' ? $message['text'] : $message['templateId'];
    }

    /** @param FollowUpSummary $summary */
    private static function summary(array $summary): void
    {
        self::text($summary['id']);
        self::text($summary['numberId']);
        self::text($summary['status']);
        self::nullableText($summary['anchorKind']);
        self::nullableText($summary['reason']);
        self::nullableText($summary['commandId']);
        foreach (['firstDeliveredAt','firstReadAt','dueAt','expiresAt','sentAt','deliveredAt','readAt','repliedAt'] as $field) {
            self::nullableNumber($summary[$field]);
        }
    }

    /** @param FollowUpReport $report */
    private static function report(array $report): void
    {
        foreach (['total','waiting','scheduled','sending','sent','delivered','read','replied','cancelled','expired','failed','unknown'] as $field) {
            self::optionalInteger($report[$field]);
        }
        self::nullableNumber($report['nextDueAt']);
    }

    private static function optionalInteger(?int $value): void
    {
    }
    private static function text(string $value): void
    {
    }
    private static function nullableText(?string $value): void
    {
    }
    private static function nullableNumber(int|float|null $value): void
    {
    }
}
