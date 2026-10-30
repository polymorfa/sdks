<?php

declare(strict_types=1);

/** @phpstan-import-type Campaign from \Polymorfa\CampaignModels
 * @phpstan-import-type Analytics from \Polymorfa\CampaignModels
 * @phpstan-import-type Recipient from \Polymorfa\CampaignModels
 * @phpstan-import-type DirectHistory from \Polymorfa\WebhookModels */
final class ExistingContractConsumer
{
    public static function publicInputs(Polymorfa\Client $org, Polymorfa\MessagingClient $messages, string $project, string $id): void
    {
        $org->campaigns->create(['projectId' => $project,'name' => 'Draft','variableMapping' => ['0' => [],'__proto__' => ['fallback' => '0']],'trackedLinks' => [], 'messagesArray' => [[],['source' => str_repeat('x', 5000),'footer' => '','delayAfterSec' => 0,'media' => ['kind' => 'image','url' => '','extension' => false],'buttons' => [['kind' => 'reply','label' => '','extension' => 0]],'extension' => null]]]);
        $org->campaigns->update($id, ['templateId' => null,'variableMapping' => null,'trackedLinks' => null,'future' => false], ['projectId' => $project]);
        $messages->campaigns->update('slug', $id, ['templateId' => null]);
        $messages->campaigns->update('slug', $id, ['variableMapping' => null]);
        $messages->campaigns->update('slug', $id, ['trackedLinks' => null]);
        $messages->campaigns->create('slug', ['name' => 'Draft','variableMapping' => ['0' => []],'messageVariations' => null,'variants' => null,'variantStrategy' => null]);
        $org->campaigns->launch($id, ['projectId' => $project,'scheduledAt' => 0,'skipMissingVariables' => false]);
        $messages->campaigns->launch('slug', $id, ['scheduledAt' => 0,'skipMissingVariables' => false]);
        $messages->campaigns->listRecipients('slug', $id, ['reason' => 'missing_variable','status' => 'failed','cursor' => 'next','limit' => 1]);
        $org->campaigns->recipients($id, ['projectId' => $project,'reason' => 'other','status' => 'queued','cursor' => 'next','limit' => 100]);
        $org->project($project)->sessionConfiguration->update(['configuration' => ['set' => ['historySync' => ['delivery' => 'descriptor']],'reset' => ['historySync.delivery']],'revision' => 0]);
        $messages->sessions->update('s', ['configuration' => ['reset' => ['historySync.delivery']],'revision' => 0]);
        $org->sessions->update('s', ['configuration' => ['set' => ['historySync' => ['delivery' => 'descriptor']]],'revision' => 0]);
        $messages->quickLinks->create(['signalMode' => 'zero_knowledge','configuration' => ['historySync' => ['delivery' => 'descriptor','consent' => 'force_off']]]);
        $messages->quickLinks->create(['purpose' => 'add_connection','session' => 's','addConnection' => 'linked_devices','configuration' => ['allowPhoneChange' => false]]);
        self::campaign($messages->campaigns->retrieve('slug', $id)->data['data']);
        self::analytics($messages->campaigns->analytics('slug', $id)->data['data']);
        foreach ($org->campaigns->recipients($id, ['projectId' => $project])->data['data'] as $r) {
            self::recipient($r);
        }
        $session = $messages->sessions->retrieve('s')->data['data'];
        if (isset($session['signalMode'])) {
            self::mode($session['signalMode']);
        }
        $config = $org->project($project)->sessionConfiguration->retrieve()->data;
        if (isset($config['effective']['historySync']['delivery'])) {
            self::delivery($config['effective']['historySync']['delivery']);
        }
        $messages->groups->getCapabilities('s', 'g')->data['data']['capabilities'];
        $messages->testing->getPhone('s')->data['online'];
        $messages->testing->sendPhoneMessage('s', ['to' => '+15555555555','text' => 'hello'])->data['messageId'];
        $messages->testing->unlinkPhoneDevice('s', 1)->data['unlinked'];
        $org->project($project)->requestLogs->list()->items;
        $messages->whatsappMedia->relayUpload('s', new Polymorfa\EncryptedMediaInfo('image', str_repeat('k', 32), str_repeat('h', 32), str_repeat('e', 32), 1, 26), static fn (?Polymorfa\CancellationToken $c): Psr\Http\Message\StreamInterface => GuzzleHttp\Psr7\Utils::streamFor('cipher'));
        $messages->whatsappMedia->createUploadGrant('s', 'sticker', str_repeat('h', 32));
        $messages->historySync->requestChunkRetry('s', ['syncType' => 'FULL','chunkOrder' => 0,'regenerate' => false])->data['data']['requestId'];
        $messages->historySync->deleteChunk('s', '/path', str_repeat('h', 32))->data['data']['status'];
    }
    /** @param Campaign $c */
    private static function campaign(array $c): void
    {
        foreach ($c['trackedLinks'] as $link) {
            self::text($link['url']);
        }
        if ($c['experimentOutcome'] !== null && $c['experimentOutcome']['state'] === 'promoted') {
            self::text($c['experimentOutcome']['winnerKey']);
        }
        if ($c['followUp'] !== null && $c['followUp']['message']['type'] === 'text') {
            self::text($c['followUp']['message']['text']);
        }
    }
    /** @param Analytics $a */
    private static function analytics(array $a): void
    {
        self::number($a['averageResponseTimeMs']);
        self::number($a['minResponseTimeMs']);
        self::number($a['maxResponseTimeMs']);
        self::number($a['followUps']['nextDueAt']);
    }
    /** @param Recipient $r */
    private static function recipient(array $r): void
    {
        self::number($r['nextMessageAt']);
        self::number($r['messagesSent']);
        if ($r['failureReason'] !== null) {
            self::text($r['failureReason']);
        }
    }
    public static function event(Polymorfa\WebhookEvent $event): void
    {
        $known = $event->knownEvent();
        if ($known === null || $known['event'] !== 'history.sync') {
            return;
        }
        $p = $known['payload'];
        if (array_key_exists('delivery', $p)) {
            self::number($p['fileLength']);
            self::text($p['whatsapp_ids']['linked_devices'] ?? '');
            if (array_key_exists('media', $p)) {
                self::text($p['media']['directPath']);
            } else {
                self::text($p['inline']['data']);
            }
        } elseif (array_key_exists('kind', $p)) {
            self::text($p['kind']);
        } else {
            self::text($p['whatsapp']['data']);
        }
    }
    private static function text(string $v): void
    {
    }
    private static function number(int|float|null $v): void
    {
    }
    /** @param 'archive'|'descriptor' $v */ private static function delivery(string $v): void
    {
    }
    /** @param 'standard'|'zero_knowledge' $v */ private static function mode(string $v): void
    {
    }
}
