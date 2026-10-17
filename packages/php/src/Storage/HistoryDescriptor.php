<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\{HistorySyncData,ProjectedHistory};

/** @internal Raw stream events must satisfy the same projected descriptor preconditions. */
final class HistoryDescriptor
{
    private static function text(mixed $v, int $min = 1, int $max = PHP_INT_MAX): bool
    {
        return is_string($v) && strlen($v) >= $min && strlen($v) <= $max;
    }
    private static function integer(mixed $v): bool
    {
        return (is_int($v) || is_float($v)) && is_finite((float)$v) && $v >= 0 && floor($v) === $v * 1.0;
    }
    private static function ids(mixed $v): bool
    {
        if (!is_array($v) || $v === []) {
            return false;
        }foreach ($v as $k => $value) {
            if (!in_array($k, ['linked_devices','official_api'], true) || !self::text($value, 1, 512)) {
                return false;
            }
        }return true;
    }
    private static function date(mixed $v): bool
    {
        if (!is_string($v) || !preg_match('/^([0-9]{4})-(0[1-9]|1[0-2])-([0-9]{2})T(?:[01][0-9]|2[0-3]):[0-5][0-9](?::[0-5][0-9](?:\.[0-9]+)?)?Z$/D', $v, $m)) {
            return false;
        }$y = (int)$m[1];
        $days = [31,$y % 4 === 0 && ($y % 100 !== 0 || $y % 400 === 0) ? 29 : 28,31,30,31,30,31,31,30,31,30,31];
        return (int)$m[3] >= 1 && (int)$m[3] <= $days[(int)$m[2] - 1];
    }
    /** @param array<string,mixed> $p */
    public static function validate(#[\SensitiveParameter] array $p): void
    {
        $valid = ($p['delivery'] ?? null) === 'descriptor' && self::ids($p['whatsapp_ids'] ?? null) && self::text($p['syncType'] ?? null) && self::integer($p['fileLength'] ?? null);
        foreach (['whatsapp_id','original_whatsapp_id'] as $key) {
            $valid = $valid && (!array_key_exists($key, $p) || self::text($p[$key], 1, 512));
        }
        $valid = $valid && (!array_key_exists('original_whatsapp_ids', $p) || self::ids($p['original_whatsapp_ids']));
        foreach (['chunkOrder','progress'] as $key) {
            $valid = $valid && (!array_key_exists($key, $p) || self::integer($p[$key]));
        }
        $valid = $valid && (!array_key_exists('progress', $p) || $p['progress'] <= 100) && (!array_key_exists('oldestMessageAt', $p) || self::date($p['oldestMessageAt']));
        if (!$valid) {
            throw new StorageException('storage_invalid_history_descriptor');
        }
        try {
            ProjectedHistory::validate(json_decode(json_encode($p, JSON_THROW_ON_ERROR), false, 512, JSON_THROW_ON_ERROR));
        } catch (\Throwable) {
            throw new StorageException('storage_invalid_history_descriptor');
        }
    }
    public static function validateChunk(#[\SensitiveParameter] mixed $v): void
    {
        if ($v instanceof HistorySyncData) {
            return;
        }
        if (!is_array($v) || ($v !== [] && array_is_list($v))) {
            throw new StorageException('storage_history_descriptor_decode_failed');
        }
        foreach (['conversations','statusV3Messages','pushnames','pastParticipants','phoneNumberToLidMappings'] as $key) {
            if (isset($v[$key])) {
                if (!is_array($v[$key]) || !array_is_list($v[$key])) {
                    throw new StorageException('storage_history_descriptor_decode_failed');
                }foreach ($v[$key] as $row) {
                    if (!is_array($row) || ($row !== [] && array_is_list($row))) {
                        throw new StorageException('storage_history_descriptor_decode_failed');
                    }
                }
            }
        }
        if (isset($v['syncType']) && !is_string($v['syncType']) && !is_int($v['syncType']) && !is_float($v['syncType'])) {
            throw new StorageException('storage_history_descriptor_decode_failed');
        }
    }
}
