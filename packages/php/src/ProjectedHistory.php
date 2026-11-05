<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Only validates the projected descriptor history variant. */
final class ProjectedHistory
{
    private static function text(mixed $value, int $min = 1, int $max = PHP_INT_MAX): bool
    {
        return CampaignContractCodec::matches($value, ['string' => [$min,$max]]);
    }
    /** @param list<string> $allowed */
    private static function fields(mixed $value, array $allowed): bool
    {
        return $value instanceof \stdClass && array_diff(array_keys(get_object_vars($value)), $allowed) === [];
    }
    private static function ids(mixed $value): bool
    {
        if (!self::fields($value, ['linked_devices','official_api']) || get_object_vars($value) === []) {
            return false;
        }
        foreach (get_object_vars($value) as $id) {
            if (!self::text($id, 1, 512)) {
                return false;
            }
        }
        return true;
    }
    private static function integer(mixed $value): bool
    {
        return (is_int($value) || is_float($value)) && is_finite((float)$value) && $value >= 0 && floor($value) === $value * 1.0;
    }
    private static function date(mixed $value): bool
    {
        if (!is_string($value) || !preg_match('/^([0-9]{4})-(0[1-9]|1[0-2])-([0-9]{2})T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]+)?)?Z$/D', $value, $m)) {
            return false;
        }
        $year = (int)$m[1];
        $days = [31,$year % 4 === 0 && ($year % 100 !== 0 || $year % 400 === 0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
        return (int)$m[3] >= 1 && (int)$m[3] <= $days[(int)$m[2] - 1];
    }
    public static function validate(mixed $payload): void
    {
        if (!$payload instanceof \stdClass || ($payload->delivery ?? null) !== 'descriptor') {
            return;
        }
        $valid = self::fields($payload, ['delivery','whatsapp_ids','original_whatsapp_ids','whatsapp_id','original_whatsapp_id','syncType','fileLength','chunkOrder','progress','oldestMessageAt','peerDataRequestSessionId','media','inline'])
            && self::ids($payload->whatsapp_ids ?? null)
            && self::text($payload->syncType ?? null)
            && self::integer($payload->fileLength ?? null);
        foreach (['whatsapp_id','original_whatsapp_id'] as $key) {
            $valid = $valid && (!property_exists($payload, $key) || self::text($payload->{$key}, 1, 512));
        }
        $valid = $valid && (!property_exists($payload, 'original_whatsapp_ids') || self::ids($payload->original_whatsapp_ids));
        foreach (['chunkOrder','progress'] as $key) {
            $valid = $valid && (!property_exists($payload, $key) || self::integer($payload->{$key}));
        }
        $valid = $valid && (!property_exists($payload, 'progress') || $payload->progress <= 100)
            && (!property_exists($payload, 'oldestMessageAt') || self::date($payload->oldestMessageAt))
            && (!property_exists($payload, 'peerDataRequestSessionId') || self::text($payload->peerDataRequestSessionId, 0));
        $media = property_exists($payload, 'media');
        $inline = property_exists($payload, 'inline');
        $valid = $valid && $media !== $inline;
        if ($media) {
            $descriptor = $payload->media;
            $valid = $valid && self::fields($descriptor, ['type','directPath','mediaKey','fileSha256','fileEncSha256','encHandle'])
                && ($descriptor->type ?? null) === 'md-msg-hist';
            foreach (['directPath','mediaKey','fileSha256','fileEncSha256'] as $key) {
                $valid = $valid && self::text($descriptor->{$key} ?? null);
            }
            $valid = $valid && (!property_exists($descriptor, 'encHandle') || self::text($descriptor->encHandle, 0));
        }
        if ($inline) {
            $descriptor = $payload->inline;
            $valid = $valid && self::fields($descriptor, ['encoding','data'])
                && ($descriptor->encoding ?? null) === 'zlib-base64-protobuf' && self::text($descriptor->data ?? null);
        }
        if (!$valid) {
            throw new ValidationException('Invalid projected history descriptor.', 'invalid_webhook_event');
        }
    }
}
