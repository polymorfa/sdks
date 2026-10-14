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
        return (is_int($v) || is_float($v) || (is_string($v) && is_numeric($v))) && is_finite((float)$v) ? (is_int($v) ? $v : (float)$v) : null;
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
