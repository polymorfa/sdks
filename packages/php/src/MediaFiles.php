<?php

declare(strict_types=1);

namespace Polymorfa;

use Psr\Http\Message\StreamInterface;

final class MediaFiles
{
    /** Writes a private sibling, then atomically replaces or exclusively links the completed file. */
    public static function write(StreamInterface $body, string $destination, bool $overwrite = true, int $maxBytes = 268435456, ?CancellationToken $cancellation = null): int
    {
        if ($destination === '' || $maxBytes <= 0) {
            throw new ConfigurationException('mediaFile');
        }
        $directory = dirname($destination);
        $temporary = $directory.'/.polymorfa-'.bin2hex(random_bytes(16));
        $file = fopen($temporary, 'xb');
        if ($file === false) {
            throw new \RuntimeException('Cannot create media output file.');
        }chmod($temporary, 0600);
        $written = 0;
        try {
            while (!self::ended($body)) {
                $cancellation?->throwIfCancelled();
                $chunk = $body->read(65536);
                if ($chunk === '' && !self::ended($body)) {
                    throw new ConnectionException('Media body stopped advancing.', 'connection_error');
                }$written += strlen($chunk);
                if ($written > $maxBytes) {
                    throw new MediaIntegrityException('Media exceeded the output limit.', 'media_too_large');
                }$offset = 0;
                while ($offset < strlen($chunk)) {
                    $count = fwrite($file, substr($chunk, $offset));
                    if ($count === false || $count === 0) {
                        throw new \RuntimeException('Cannot write media output file.');
                    }$offset += $count;
                }
            }
            $cancellation?->throwIfCancelled();
            if (!fflush($file)) {
                throw new \RuntimeException('Cannot flush media output file.');
            }fclose($file);
            $file = null;
            if ($overwrite) {
                if (!rename($temporary, $destination)) {
                    throw new \RuntimeException('Cannot replace media output file.');
                }
            } else {
                if (!link($temporary, $destination)) {
                    throw new \RuntimeException('Media output file already exists or cannot be linked.');
                }unlink($temporary);
            }
            return $written;
        } finally {
            if (is_resource($file)) {
                fclose($file);
            }$body->close();
            if (is_file($temporary)) {
                unlink($temporary);
            }
        }
    }
    /** @phpstan-impure */
    private static function ended(StreamInterface $body): bool
    {
        return $body->eof();
    }
    public static function filename(?string $header): ?string
    {
        if ($header === null || strlen($header) > 8192) {
            return null;
        }$parameters = [];
        preg_match_all('/;\s*([^=;]+)\s*=\s*("(?:[^"\\\\]|\\\\.)*"|[^;]*)/', $header, $matches, PREG_SET_ORDER);
        foreach ($matches as $match) {
            $key = strtolower(trim($match[1]));
            $value = trim($match[2]);
            if (str_starts_with($value, '"')) {
                $value = preg_replace('/\\\\(.)/s', '$1', substr($value, 1, -1)) ?? '';
            }$parameters[$key] ??= $value;
        }
        $value = $parameters['filename'] ?? null;
        $extended = $parameters['filename*'] ?? null;
        if ($extended !== null && preg_match("/^([^']+)'[A-Za-z0-9-]*'(.*)$/D", $extended, $match) === 1 && preg_match('/^(?:[A-Za-z0-9!#$&+.^_`|~-]|%[0-9A-Fa-f]{2})*$/D', $match[2]) === 1) {
            $bytes = rawurldecode($match[2]);
            $charset = strtolower($match[1]);
            if ($charset === 'utf-8' && preg_match('//u', $bytes) === 1) {
                $value = $bytes;
            } elseif ($charset === 'iso-8859-1') {
                $value = self::latin1($bytes);
            }
        }
        if ($value === null) {
            return null;
        }$parts = preg_split('/[\\\\\/]/', $value);
        $clean = trim(preg_replace('/[\x00-\x1f\x7f]/', '', ($parts === false ? '' : (string)end($parts))) ?? '');
        return in_array($clean, ['','.','..'], true) ? null : $clean;
    }
    private static function latin1(string $bytes): string
    {
        $out = '';
        for ($i = 0;$i < strlen($bytes);++$i) {
            $code = ord($bytes[$i]);
            $out .= $code < 128 ? $bytes[$i] : chr(0xc0 | ($code >> 6)).chr(0x80 | ($code & 63));
        }return $out;
    }
    public static function signedUrlExpiry(string $value): ?\DateTimeImmutable
    {
        $url = parse_url($value);
        if ($url === false || !isset($url['scheme'],$url['host'])) {
            return null;
        }parse_str($url['query'] ?? '', $query);
        $date = $query['X-Amz-Date'] ?? null;
        $seconds = $query['X-Amz-Expires'] ?? null;
        if (is_string($date) && is_string($seconds) && ctype_digit($seconds) && preg_match('/^\d{8}T\d{6}Z$/D', $date) === 1) {
            $start = \DateTimeImmutable::createFromFormat('!Ymd\THis\Z', $date, new \DateTimeZone('UTC'));
            if ($start !== false) {
                return $start->modify('+'.(int)$seconds.' seconds');
            }
        }
        $expires = $query['Expires'] ?? null;
        if (is_string($expires) && preg_match('/^\d{9,11}$/D', $expires) === 1) {
            return new \DateTimeImmutable('@'.$expires);
        }return null;
    }
}
