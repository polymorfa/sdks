<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\{HistorySyncData,ProjectedHistory};

/** @internal Raw stream events must satisfy the same projected descriptor preconditions. */
final class HistoryDescriptor
{
    /** @param array<string,mixed> $p */
    public static function validate(#[\SensitiveParameter] array $p): void
    {
        if (($p['delivery'] ?? null) !== 'descriptor') {
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
