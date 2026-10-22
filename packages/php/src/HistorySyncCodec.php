<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\ClientInterface;

/** Local verified history, not hosted history. WhatsApp Web inflates then parses:
 * Cellar whatsapp-1049950004 modules/WAWebHandleHistorySyncChunk.js:134-136. */
final class HistorySyncCodec
{
    public const MAX_INFLATED_BYTES = 536870912;
    /** @param (\Closure(string):mixed)|null $decoder Receives verified raw protobuf. */
    public static function download(HistorySyncChunkDescriptor|string $input, int $maxBytes = WhatsAppMedia::MAX_BYTES, int $maxInflatedBytes = self::MAX_INFLATED_BYTES, ?CancellationToken $cancellation = null, ?ClientInterface $http = null, ?\Closure $decoder = null): HistorySyncData
    {
        $cancellation?->throwIfCancelled();
        if ($maxInflatedBytes < 1 || $maxInflatedBytes > 9007199254740991) {
            throw new ConfigurationException('maxInflatedBytes');
        }
        if ($maxBytes < 1 || $maxBytes > 9007199254740991) {
            throw new ConfigurationException('maxBytes');
        }
        if ($input instanceof HistorySyncChunkDescriptor) {
            $compressed = WhatsAppMedia::download(new MediaDescriptor('md-msg-hist', $input->mediaKey, directPath:$input->directPath, fileSha256:$input->fileSha256, fileEncSha256:$input->fileEncSha256, fileLength:$input->fileLength), $maxBytes, $cancellation, $http);
        } else {
            $compressed = $input;
        }
        if (strlen($compressed) > $maxBytes) {
            self::tooLarge();
        }
        return self::decode($compressed, $maxInflatedBytes, $cancellation, $decoder);
    }
    /** @param (\Closure(string):mixed)|null $decoder */
    public static function decode(#[\SensitiveParameter] string $compressed, int $maxInflatedBytes = self::MAX_INFLATED_BYTES, ?CancellationToken $cancellation = null, ?\Closure $decoder = null): HistorySyncData
    {
        $cancellation?->throwIfCancelled();
        if ($maxInflatedBytes < 1 || $maxInflatedBytes > 9007199254740991) {
            throw new ConfigurationException('maxInflatedBytes');
        }
        if ($compressed === '') {
            self::invalid();
        }
        $format = str_starts_with($compressed, "\x1f\x8b") ? ZLIB_ENCODING_GZIP : (strlen($compressed) >= 2 && (ord($compressed[0]) & 15) === 8 && ((ord($compressed[0]) << 8) | ord($compressed[1])) % 31 === 0 ? ZLIB_ENCODING_DEFLATE : ZLIB_ENCODING_RAW);
        $inflater = inflate_init($format);
        if ($inflater === false) {
            self::invalid();
        }
        $protobuf = '';
        // At most 64 compressed bytes per step bounds transient expansion even
        // when the caller chooses an inflated limit smaller than a normal block.
        for ($offset = 0;$offset < strlen($compressed);$offset += 64) {
            $cancellation?->throwIfCancelled();
            $chunk = @inflate_add($inflater, substr($compressed, $offset, 64), $offset + 64 >= strlen($compressed) ? ZLIB_FINISH : ZLIB_SYNC_FLUSH);
            if ($chunk === false) {
                self::invalid();
            }
            if (strlen($protobuf) + strlen($chunk) > $maxInflatedBytes) {
                self::tooLarge();
            }
            $protobuf .= $chunk;
            if (inflate_get_status($inflater) === ZLIB_STREAM_END) {
                break;
            }
        }
        if (inflate_get_status($inflater) !== ZLIB_STREAM_END || inflate_get_read_len($inflater) !== strlen($compressed)) {
            self::invalid();
        }
        $count = 0;
        $fields = self::fields($protobuf, $count);
        $syncType = $order = $progress = null;
        $conversations = [];
        foreach ($fields as $field) {
            if ($field->wireType === 0 && in_array($field->number, [1,5,6], true)) {
                if ($field->integer === null || $field->integer > 4294967295) {
                    self::invalid();
                }
                match($field->number) {
                    1 => $syncType = $field->integer,5 => $order = $field->integer,6 => $progress = $field->integer
                };
            }
            if ($field->number === 2 && $field->wireType === 2) {
                $conversations[] = self::conversation($field->value, $count);
            }
        }
        if ($syncType === null) {
            self::invalid();
        }
        $decoded = null;
        if ($decoder !== null) {
            try {
                $decoded = $decoder($protobuf);
            } catch (\Throwable) {
                $cancellation?->throwIfCancelled();
                self::invalid();
            }
            $cancellation?->throwIfCancelled();
        }
        return new HistorySyncData($protobuf, $fields, $syncType, $order, $progress, $conversations, $decoded);
    }
    private static function tooLarge(): never
    {
        throw new MediaIntegrityException('The history chunk exceeds the permitted size.', 'media_too_large');
    }
    private static function invalid(): never
    {
        throw new MediaIntegrityException('The history chunk is not valid compressed HistorySync data.', 'media_invalid_ciphertext');
    }
    /** @return array{?int,string} */
    private static function varint(string $raw, int &$offset): array
    {
        $start = $offset;
        $value = 0;
        for ($i = 0;$i < 10;$i++) {
            if ($offset >= strlen($raw)) {
                self::invalid();
            }
            $byte = ord($raw[$offset++]);
            if ($i === 9 && $byte > 1) {
                self::invalid();
            }
            if ($i < 9) {
                $value |= ($byte & 127) << ($i * 7);
            }
            if (($byte & 128) === 0) {
                return [$i === 9 && $byte === 1 ? null : $value,substr($raw, $start, $offset - $start)];
            }
        }
        self::invalid();
    }
    /** @return list<HistoryProtobufField> */
    private static function fields(string $raw, int &$count): array
    {
        $offset = 0;
        return self::parseFields($raw, $offset, $count, 0, 0);
    }
    /** @return list<HistoryProtobufField> */
    private static function parseFields(string $raw, int &$offset, int &$count, int $depth, int $group): array
    {
        if ($depth > 64) {
            self::invalid();
        }
        $fields = [];
        while ($offset < strlen($raw)) {
            $start = $offset;
            [$tag] = self::varint($raw, $offset);
            if ($tag === null || ($tag >> 3) === 0 || ($tag >> 3) > 536870911) {
                self::invalid();
            }
            $number = $tag >> 3;
            $wire = $tag & 7;
            $integer = null;
            $value = '';
            if ($wire === 4) {
                if ($group === $number) {
                    return $fields;
                }self::invalid();
            }
            if (++$count > 1000000) {
                self::invalid();
            }
            if ($wire === 0) {
                [$integer,$value] = self::varint($raw, $offset);
            } elseif (in_array($wire, [1,2,5], true)) {
                $size = $wire === 1 ? 8 : 4;
                if ($wire === 2) {
                    [$size] = self::varint($raw, $offset);
                }
                if ($size === null || $size > strlen($raw) - $offset) {
                    self::invalid();
                }
                $value = substr($raw, $offset, $size);
                $offset += $size;
            } elseif ($wire === 3) {
                $valueStart = $offset;
                self::parseFields($raw, $offset, $count, $depth + 1, $number);
                $value = substr($raw, $valueStart, $offset - $valueStart);
            } else {
                self::invalid();
            }
            $fields[] = new HistoryProtobufField($number, $wire, substr($raw, $start, $offset - $start), $value, $integer);
        }
        if ($group !== 0) {
            self::invalid();
        }
        return $fields;
    }
    private static function conversation(string $raw, int &$count): HistoryConversation
    {
        $fields = self::fields($raw, $count);
        $id = null;
        $messages = [];
        foreach ($fields as $field) {
            if ($field->number === 1 && $field->wireType === 2) {
                if (preg_match('//u', $field->value) !== 1) {
                    self::invalid();
                }$id = $field->value;
            }
            if ($field->number === 2 && $field->wireType === 2) {
                $parts = self::fields($field->value, $count);
                $message = $order = null;
                foreach ($parts as $part) {
                    if ($part->number === 1 && $part->wireType === 2) {
                        self::fields($part->value, $count);
                        $message = $part->value;
                    }
                    if ($part->number === 2 && $part->wireType === 0) {
                        $order = $part->value;
                    }
                }
                $messages[] = new HistorySyncMessage($field->value, $parts, $message, $order);
            }
        }
        if ($id === null) {
            self::invalid();
        }
        return new HistoryConversation($id, $raw, $fields, $messages);
    }
}
