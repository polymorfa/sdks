<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Handwritten schema2 merge and canonical comparison; source SDK 3bacf46. */
final class Rows
{
    public const FINAL_VERSION = 9007199254740991;

    /**
     * @param array<string,string> $key
     * @return array<string,mixed> */
    public static function empty(string $entity, array $key): array
    {
        $definition = Schema::definition($entity);
        $row = array_fill_keys(array_keys($definition['fields']), null);
        foreach ($definition['key'] as $name) {
            $row[$name] = $key[$name];
        }
        foreach ($definition['indexes'] as $index) {
            $row[$index['sort']] = 0;
        }
        return $row + ['_id' => Schema::encodeKey($entity, $key), '_rev' => 0, '_v' => []];
    }

    /**
     * @param array<string,mixed> $row
     * @param array<string,FieldWrite> $fields
     * @return array<string,mixed> */
    public static function merge(string $entity, array $row, array $fields): array
    {
        $definition = Schema::definition($entity);
        $versions = (array) $row['_v'];
        foreach ($fields as $name => $write) {
            $type = $definition['fields'][$name] ?? null;
            if ($type === null || !is_finite((float)$write->version) || !self::matches($write->value, $type)) {
                Schema::invalid();
            }
            Schema::validateJson($write->value);
            $previous = $versions[$name] ?? null;
            if ($previous === null || $write->version > $previous || ($write->version == $previous && self::compare($write->value, $row[$name] ?? null) > 0)) {
                $row[$name] = self::copy($write->value);
                $versions[$name] = $write->version;
            }
        }
        $row['_v'] = $versions;
        return $row;
    }

    private static function matches(mixed $value, string $type): bool
    {
        return $value === null || match($type) {
            'json' => true, 'string' => is_string($value), 'boolean' => is_bool($value),
            'number' => (is_int($value) || is_float($value)) && is_finite((float)$value), default => false,
        };
    }

    public static function copy(mixed $value): mixed
    {
        if (is_array($value)) {
            return array_map(self::copy(...), $value);
        }
        if ($value instanceof \stdClass) {
            $result = new \stdClass();
            foreach (get_object_vars($value) as $key => $child) {
                $result->{$key} = self::copy($child);
            } return $result;
        }
        return $value;
    }

    public static function canonical(mixed $value): string
    {
        Schema::validateJson($value);
        if (is_int($value) || is_float($value)) {
            $number = (float)$value;
            if ($number == 0) {
                return '0';
            }
            $raw = strtolower(json_encode($number, JSON_THROW_ON_ERROR));
            [$mantissa, $exponent] = array_pad(explode('e', $raw, 2), 2, '0');
            $negative = str_starts_with($mantissa, '-');
            $digits = ltrim($mantissa, '-');
            $dot = strpos($digits, '.');
            $decimal = ($dot === false ? strlen($digits) : $dot) + (int)$exponent;
            $digits = str_replace('.', '', $digits);
            $digits = rtrim($digits, '0');
            if ($digits === '') {
                $digits = '0';
            }
            $sign = $negative ? '-' : '';
            if (abs($number) >= 1e-6 && abs($number) < 1e21) {
                return $sign.($decimal <= 0 ? '0.'.str_repeat('0', -$decimal).$digits : ($decimal >= strlen($digits) ? $digits.str_repeat('0', $decimal - strlen($digits)) : substr($digits, 0, $decimal).'.'.substr($digits, $decimal)));
            }
            $exp = $decimal - 1;
            return $sign.$digits[0].(strlen($digits) > 1 ? '.'.substr($digits, 1) : '').'e'.($exp >= 0 ? '+' : '-').abs($exp);
        }
        if ($value instanceof \stdClass || (is_array($value) && !array_is_list($value))) {
            $fields = (array)$value;
            uksort($fields, static fn (string|int $a, string|int $b): int => strcmp(self::utf16((string)$a), self::utf16((string)$b)));
            $items = [];
            foreach ($fields as $key => $child) {
                $items[] = self::canonical((string)$key).':'.self::canonical($child);
            }
            return '{'.implode(',', $items).'}';
        }
        if (is_array($value)) {
            return '['.implode(',', array_map(self::canonical(...), $value)).']';
        }
        return json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES | JSON_UNESCAPED_LINE_TERMINATORS);
    }

    public static function compare(mixed $a, mixed $b): int
    {
        $rank = static fn (mixed $v): int => $v === null ? -1 : (is_bool($v) ? 0 : ((is_int($v) || is_float($v)) ? 1 : (is_string($v) ? 2 : 3)));
        $left = $rank($a);
        $right = $rank($b);
        if ($left !== $right) {
            return $left <=> $right;
        }
        if ($left < 2) {
            return $a <=> $b;
        }
        return strcmp(self::utf16(is_string($a) ? $a : self::canonical($a)), self::utf16(is_string($b) ? $b : self::canonical($b))) <=> 0;
    }

    private static function utf16(string $value): string
    {
        // No mbstring/iconv dependency: lexicographic UTF-16BE, as JavaScript uses.
        $result = '';
        $size = strlen($value);
        for ($i = 0; $i < $size;) {
            $first = ord($value[$i++]);
            if ($first < 128) {
                $point = $first;
            } else {
                $count = $first < 224 ? 1 : ($first < 240 ? 2 : 3);
                $point = $first & (127 >> $count);
                for ($j = 0; $j < $count; $j++) {
                    $point = ($point << 6) | (ord($value[$i++]) & 63);
                }
            }
            if ($point <= 65535) {
                $result .= pack('n', $point);
            } else {
                $point -= 65536;
                $result .= pack('nn', 55296 | ($point >> 10), 56320 | ($point & 1023));
            }
        }
        return $result;
    }
}
