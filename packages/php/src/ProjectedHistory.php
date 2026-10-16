<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Only validates the projected descriptor history variant. */
final class ProjectedHistory
{
    public static function validate(mixed $payload): void
    {
        if (!$payload instanceof \stdClass || ($payload->delivery ?? null) !== 'descriptor') {
            return;
        }
        $o = static fn (array $v, array $optional = []): array => ['object' => $v,'optional' => $optional];
        $text = ['string' => [1,PHP_INT_MAX]];
        $ids = $o(['linked_devices' => $text,'official_api' => $text], ['linked_devices','official_api']);
        $common = $o(['delivery' => ['enum' => ['descriptor']],'whatsapp_ids' => $ids,'original_whatsapp_ids' => $ids,'whatsapp_id' => 'string','original_whatsapp_id' => 'string','syncType' => 'string','fileLength' => 'number','chunkOrder' => 'number','progress' => 'number','oldestMessageAt' => 'string','peerDataRequestSessionId' => 'string'], ['original_whatsapp_ids','whatsapp_id','original_whatsapp_id','chunkOrder','progress','oldestMessageAt','peerDataRequestSessionId']);
        $media = property_exists($payload, 'media');
        $inline = property_exists($payload, 'inline');
        $valid = CampaignContractCodec::matches($payload, $common) && $payload->fileLength >= 0 && $media !== $inline;
        if (property_exists($payload, 'chunkOrder')) {
            $valid = $valid && is_int($payload->chunkOrder) && $payload->chunkOrder >= 0;
        }
        if (property_exists($payload, 'progress')) {
            $valid = $valid && is_int($payload->progress) && $payload->progress >= 0 && $payload->progress <= 100;
        }
        if (property_exists($payload, 'oldestMessageAt')) {
            $valid = $valid && is_string($payload->oldestMessageAt) && preg_match('/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d+)?(?:Z|[+-]\d\d:\d\d)$/D', $payload->oldestMessageAt);
        }
        if ($media) {
            $valid = $valid && CampaignContractCodec::matches($payload->media, $o(['type' => ['enum' => ['md-msg-hist']],'directPath' => $text,'mediaKey' => $text,'fileSha256' => $text,'fileEncSha256' => $text,'encHandle' => 'string'], ['encHandle']));
        }
        if ($inline) {
            $valid = $valid && CampaignContractCodec::matches($payload->inline, $o(['encoding' => ['enum' => ['zlib-base64-protobuf']],'data' => $text]));
        }
        if (!$valid) {
            throw new ValidationException('Invalid projected history descriptor.', 'invalid_webhook_event');
        }
    }
}
