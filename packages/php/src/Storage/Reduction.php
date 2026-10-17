<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Pure common helpers; no storage or network effects. */
final class Reduction
{
    public const CONTENT = ['text','caption','mimeType','fileName','latitude','longitude','displayName','title','pollOptions','extra'];
    public const MEDIA_SECRETS = ['mediaKey','descriptor','directPath','downloadUrl','fileSha256','fileEncSha256'];
    public const STATUS = ['pending' => 1,'failed' => 2,'sent' => 3,'delivered' => 4,'read' => 5,'played' => 6];
    public static function text(mixed $v): ?string
    {
        return is_string($v) && $v !== '' ? $v : null;
    }
    /**
     * @return array<string,mixed> */
    public static function record(mixed $v): array
    {
        return $v instanceof \stdClass ? get_object_vars($v) : (is_array($v) ? $v : []);
    }
    /**
     * @return list<array<string,mixed>> */
    public static function records(mixed $v): array
    {
        return is_array($v) && array_is_list($v) ? array_map(self::record(...), $v) : [];
    }
    public static function number(mixed $v): int|float|null
    {
        if (is_string($v)) {
            // ECMAScript WhiteSpace + LineTerminator, excluding NEL and NUL.
            $space = '\x{0009}-\x{000d}\x{0020}\x{00a0}\x{1680}\x{2000}-\x{200a}\x{2028}\x{2029}\x{202f}\x{205f}\x{3000}\x{feff}';
            $source = preg_replace('/\A['.$space.']+|['.$space.']+\z/u', '', $v);
            if ($source === null) {
                return null;
            }
            if ($source === '') {
                return 0.0;
            }
            if (strlen($source) >= 2 && $source[0] === '0') {
                $width = match ($source[1]) {
                    'x', 'X' => 4, 'o', 'O' => 3, 'b', 'B' => 1, default => 0
                };
                if ($width !== 0) {
                    return self::radixNumber(substr($source, 2), $width);
                }
            }
            if (preg_match('/\A[+-]?(?:[0-9]+(?:\.[0-9]*)?|\.[0-9]+)(?:[eE][+-]?[0-9]+)?\z/', $source) !== 1) {
                return null;
            }
            $number = (float)$source;
            return is_finite($number) ? $number : null;
        }
        return (is_int($v) || is_float($v)) && is_finite((float)$v) ? $v : null;
    }
    /** Power-of-two radix conversion with one nearest-even rounding. */
    private static function radixNumber(string $digits, int $width): ?float
    {
        if ($digits === '') {
            return null;
        }
        $length = 0;
        $head = '';
        $guard = false;
        $sticky = false;
        for ($i = 0, $count = strlen($digits); $i < $count; $i++) {
            $digit = strpos('0123456789abcdef', strtolower($digits[$i]));
            if ($digit === false || $digit >= (1 << $width)) {
                return null;
            }
            for ($shift = $width - 1; $shift >= 0; $shift--) {
                $bit = ($digit >> $shift) & 1;
                if ($length === 0 && $bit === 0) {
                    continue;
                }
                // Saturation bounds arithmetic; later digits are still validated.
                $length = min(1025, $length + 1);
                if ($length <= 53) {
                    $head .= (string)$bit;
                } elseif ($length === 54) {
                    $guard = $bit === 1;
                } else {
                    $sticky = $sticky || $bit === 1;
                }
            }
        }
        if ($length > 1024) {
            return null;
        }
        // The bounded 53-bit prefix is exact, also when PHP integers are 32-bit.
        $significand = (float)bindec($head);
        if ($length <= 53) {
            return $significand;
        }
        if ($guard && ($sticky || fmod($significand, 2.0) === 1.0)) {
            $significand += 1.0;
        }
        $number = $significand * (2.0 ** ($length - 53));
        return is_finite($number) ? $number : null;
    }

    public static function millis(mixed $v): ?float
    {
        $n = self::number($v);
        if ($n === null || $n <= 0) {
            return null;
        } $n = floor(($n < 100000000000 ? $n * 1000 : $n) + 0.5);
        return is_finite($n) ? $n : null;
    }
    public static function iso(string $v): float
    {
        if (preg_match('/^\d{4}-\d{2}-\d{2}T/', $v) !== 1) {
            return 0;
        } try {
            return (float)(new \DateTimeImmutable($v))->format('U.u') * 1000;
        } catch (\Exception) {
            return 0;
        }
    }
    /**
     * @param array<string,FieldWrite> $f */
    public static function put(array &$f, string $name, mixed $value, int|float $version): void
    {
        if ($value !== Unspecified::Value) {
            $f[$name] = new FieldWrite($value, $version);
        }
    }
    /**
     * @param array<string,FieldWrite> $f */
    public static function present(array &$f, string $name, mixed $value, int|float $version): void
    {
        if ($value !== null) {
            $f[$name] = new FieldWrite($value, $version);
        }
    }
    /**
     * @param list<string> $names
     * @return array<string,FieldWrite> */
    public static function cleared(array $names, int|float $version = Rows::FINAL_VERSION): array
    {
        return array_fill_keys($names, new FieldWrite(null, $version));
    }
    /**
     * @param array<string,FieldWrite> $f */
    public static function status(array &$f, string $status, int|float|null $at = null): void
    {
        $rank = self::STATUS[$status];
        self::put($f, 'status', $status, $rank);
        self::present($f, 'statusAt', $at, $rank);
    }
    public static function chatKind(?string $jid, ?bool $group = null): ?string
    {
        return $group === true ? 'group' : ($jid !== null ? (str_ends_with($jid, '@g.us') ? 'group' : (str_ends_with($jid, '@newsletter') ? 'channel' : (str_ends_with($jid, '@broadcast') ? 'broadcast' : 'direct'))) : ($group === false ? 'direct' : null));
    }
}
