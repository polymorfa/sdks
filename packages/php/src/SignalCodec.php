<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Handwritten wire validation for the pinned local application API. */
final class SignalCodec
{
    public const MAX_BYTES = 8388608;
    public static function invalid(): never
    {
        throw new SignalSidecarException('The Signal sidecar returned an invalid response.', 'signal_sidecar_invalid_response');
    }
    public static function secret(string $value): bool
    {
        return preg_match('/^[!-~]{16,}$/D', $value) === 1;
    }
    /** @return array<string,mixed> */
    public static function object(#[\SensitiveParameter] string $raw): array
    {
        if (strlen($raw) > self::MAX_BYTES) {
            self::invalid();
        }
        try {
            $value = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
        } catch (\JsonException) {
            self::invalid();
        }
        if (!is_array($value) || array_is_list($value)) {
            self::invalid();
        }
        /** @var array<string,mixed> $value */
        return $value;
    }
    /** @param array<string,mixed> $data */
    public static function string(array $data, string $key): string
    {
        if (!isset($data[$key]) || !is_string($data[$key])) {
            self::invalid();
        }return $data[$key];
    }
    /** @param array<string,mixed> $data */
    public static function optionalString(array $data, string $key, bool $nullable = false): ?string
    {
        if (!array_key_exists($key, $data) || ($nullable && $data[$key] === null)) {
            return null;
        }return self::string($data, $key);
    }
    /** @param array<string,mixed> $data */
    public static function integer(array $data, string $key): int
    {
        if (!isset($data[$key]) || !is_int($data[$key])) {
            self::invalid();
        }return $data[$key];
    }
    /** @param array<string,mixed> $data */
    public static function optionalInteger(array $data, string $key, bool $nullable = false): ?int
    {
        if (!array_key_exists($key, $data) || ($nullable && $data[$key] === null)) {
            return null;
        }return self::integer($data, $key);
    }
    /** @param array<string,mixed> $data */
    public static function boolean(array $data, string $key): bool
    {
        if (!isset($data[$key]) || !is_bool($data[$key])) {
            self::invalid();
        }return $data[$key];
    }
    /** @param array<string,mixed> $data */
    public static function optionalBoolean(array $data, string $key): ?bool
    {
        if (!array_key_exists($key, $data)) {
            return null;
        }return self::boolean($data, $key);
    }
    /** @param array<string,mixed> $data */
    public static function binary(array $data, string $key): string
    {
        $encoded = self::string($data, $key);
        $raw = base64_decode($encoded, true);
        if ($raw === false || base64_encode($raw) !== $encoded) {
            self::invalid();
        }return $raw;
    }
    /** @param array<string,mixed> $data */
    public static function optionalBinary(array $data, string $key): ?string
    {
        if (!array_key_exists($key, $data) || $data[$key] === null) {
            return null;
        }return self::binary($data, $key);
    }
}
