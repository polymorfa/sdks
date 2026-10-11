<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\TransferException;

/** Buffered authenticated media; never releases plaintext before all checks pass. */
final class WhatsAppMedia
{
    public const MAX_BYTES = 268435456;
    /** @var array<string,array<int,string>> */
    private const FIELDS = [
        'image' => [1 => 'url',2 => 'mimetype',4 => 'fileSha256',5 => 'fileLength',8 => 'mediaKey',9 => 'fileEncSha256',11 => 'directPath'],
        'video' => [1 => 'url',2 => 'mimetype',3 => 'fileSha256',4 => 'fileLength',6 => 'mediaKey',11 => 'fileEncSha256',13 => 'directPath'],
        'audio' => [1 => 'url',2 => 'mimetype',3 => 'fileSha256',4 => 'fileLength',7 => 'mediaKey',8 => 'fileEncSha256',9 => 'directPath'],
        'document' => [1 => 'url',2 => 'mimetype',4 => 'fileSha256',5 => 'fileLength',7 => 'mediaKey',8 => 'fileName',9 => 'fileEncSha256',10 => 'directPath'],
        'sticker' => [1 => 'url',2 => 'fileSha256',3 => 'fileEncSha256',4 => 'mediaKey',5 => 'mimetype',8 => 'directPath',9 => 'fileLength'],
    ];
    /** @param 'image'|'video'|'audio'|'document'|'sticker' $mediaKind */
    public static function decode(string $encoded, string $mediaKind): MediaDescriptor
    {
        if ($encoded === '' || strlen($encoded) > 1048576 || !self::isKind($mediaKind)) {
            self::invalid();
        }
        $raw = base64_decode(strtr($encoded, '-_', '+/'), true);
        if ($raw === false) {
            self::invalid();
        }
        $offset = 0;
        $values = [];
        while ($offset < strlen($raw)) {
            $tag = self::varint($raw, $offset);
            $field = $tag >> 3;
            $wire = $tag & 7;
            if ($field === 0) {
                self::invalid();
            }
            $name = self::FIELDS[$mediaKind][$field] ?? null;
            if ($wire === 0) {
                $value = self::varint($raw, $offset);
            } elseif (in_array($wire, [1,2,5], true)) {
                $size = $wire === 2 ? self::varint($raw, $offset) : ($wire === 1 ? 8 : 4);
                if ($size > strlen($raw) - $offset) {
                    self::invalid();
                }
                $value = substr($raw, $offset, $size);
                $offset += $size;
            } else {
                self::invalid();
            }
            if ($name === null) {
                continue;
            }
            // Known bytes fields encoded with another wire type are ignored like the pinned TS reader.
            if ($name === 'fileLength') {
                if ($wire !== 0) {
                    continue;
                }
                if ($value > 9007199254740991) {
                    self::invalid();
                }
            } else {
                if ($wire !== 2) {
                    continue;
                }
                if (in_array($name, ['mediaKey','fileSha256','fileEncSha256'], true)) {
                    if (strlen($value) !== 32) {
                        self::invalid();
                    }
                } elseif (strlen($value) > (in_array($name, ['url','directPath'], true) ? 8192 : ($name === 'mimetype' ? 255 : 4096)) || preg_match('//u', $value) !== 1) {
                    self::invalid();
                }
            }
            $values[$name] = $value;
        }
        if (!isset($values['mediaKey']) || !is_string($values['mediaKey'])) {
            self::invalid();
        }
        $string = static fn (string $name): ?string => isset($values[$name]) && is_string($values[$name]) ? $values[$name] : null;
        return new MediaDescriptor($mediaKind, $values['mediaKey'], $string('url'), $string('directPath'), $string('fileSha256'), $string('fileEncSha256'), isset($values['fileLength']) && is_int($values['fileLength']) ? $values['fileLength'] : null, $string('mimetype'), $string('fileName'));
    }
    /** @param 'image'|'video'|'audio'|'document'|'sticker' $mediaKind
     * @return array{iv:string,cipherKey:string,macKey:string} */
    public static function deriveKeys(#[\SensitiveParameter] string $key, string $mediaKind): array
    {
        if (strlen($key) !== 32 || !self::isKind($mediaKind)) {
            self::invalid();
        }
        $info = 'WhatsApp '.ucfirst($mediaKind === 'sticker' ? 'image' : $mediaKind).' Keys';
        $expanded = hash_hkdf('sha256', $key, 112, $info, '');
        return ['iv' => substr($expanded, 0, 16),'cipherKey' => substr($expanded, 16, 32),'macKey' => substr($expanded, 48, 32)];
    }
    public static function decrypt(#[\SensitiveParameter] string $encrypted, MediaDescriptor $descriptor, int $maxBytes = self::MAX_BYTES): string
    {
        if ($maxBytes <= 0) {
            throw new ConfigurationException('maxBytes');
        }
        if ($descriptor->fileLength !== null && $descriptor->fileLength > $maxBytes) {
            self::fail('media_too_large');
        }
        $limit = min($maxBytes, $descriptor->fileLength ?? $maxBytes);
        if (strlen($encrypted) > (intdiv($limit, 16) + 1) * 16 + 10) {
            self::fail('media_too_large');
        }
        if (strlen($encrypted) <= 10) {
            self::fail('media_too_short');
        }
        if ($descriptor->fileEncSha256 !== null && !hash_equals($descriptor->fileEncSha256, hash('sha256', $encrypted, true))) {
            self::fail('media_enc_hash_mismatch');
        }
        $keys = self::deriveKeys($descriptor->mediaKey, $descriptor->mediaKind);
        $cipher = substr($encrypted, 0, -10);
        $mac = substr($encrypted, -10);
        if (!hash_equals($mac, substr(hash_hmac('sha256', $keys['iv'].$cipher, $keys['macKey'], true), 0, 10))) {
            self::fail('media_mac_mismatch');
        }
        if ($cipher === '' || strlen($cipher) % 16 !== 0) {
            self::fail('media_invalid_ciphertext');
        }
        $plaintext = openssl_decrypt($cipher, 'aes-256-cbc', $keys['cipherKey'], OPENSSL_RAW_DATA, $keys['iv']);
        if ($plaintext === false) {
            self::fail('media_invalid_padding');
        }
        if (strlen($plaintext) > $maxBytes) {
            self::fail('media_too_large');
        }
        if ($descriptor->fileSha256 !== null && !hash_equals($descriptor->fileSha256, hash('sha256', $plaintext, true))) {
            self::fail('media_hash_mismatch');
        }
        return $plaintext;
    }
    public static function isMediaUrl(string $url): bool
    {
        $parsed = parse_url($url);
        if ($parsed === false || ($parsed['scheme'] ?? '') !== 'https' || !isset($parsed['host']) || isset($parsed['user']) || isset($parsed['pass']) || isset($parsed['fragment']) || (isset($parsed['port']) && $parsed['port'] !== 443)) {
            return false;
        }
        $host = strtolower($parsed['host']);
        return $host === 'whatsapp.net' || str_ends_with($host, '.whatsapp.net');
    }
    public static function download(MediaDescriptor $descriptor, int $maxBytes = self::MAX_BYTES, ?CancellationToken $cancellation = null, ?ClientInterface $http = null): string
    {
        $url = $descriptor->url;
        if ($url === null && $descriptor->directPath !== null) {
            if (!str_starts_with($descriptor->directPath, '/') || str_starts_with($descriptor->directPath, '//') || str_contains($descriptor->directPath, '\\')) {
                self::invalid();
            }
            $url = 'https://mmg.whatsapp.net'.$descriptor->directPath;
        }
        if ($url === null || !self::isMediaUrl($url)) {
            throw new ConfigurationException('mediaUrl');
        }
        if ($maxBytes <= 0) {
            throw new ConfigurationException('maxBytes');
        }
        if ($descriptor->fileLength !== null && $descriptor->fileLength > $maxBytes) {
            self::fail('media_too_large');
        }
        $cancellation?->throwIfCancelled();
        $limit = (intdiv(min($maxBytes, $descriptor->fileLength ?? $maxBytes), 16) + 1) * 16 + 10;
        $downloaded = '';
        // A separate session receives no API credentials, cookies or authorization defaults.
        $client = $http ?? new Client(['allow_redirects' => false]);
        try {
            $response = $client->request('GET', $url, ['http_errors' => false,'allow_redirects' => false,'timeout' => 30,'headers' => [],
                'sink' => \GuzzleHttp\Psr7\FnStream::decorate(\GuzzleHttp\Psr7\Utils::streamFor(''), ['write' => function (string $chunk) use (&$downloaded, $limit, $cancellation): int {
                    $cancellation?->throwIfCancelled();
                    if (strlen($downloaded) + strlen($chunk) > $limit) {
                        self::fail('media_too_large');
                    }
                    $downloaded .= $chunk;
                    return strlen($chunk);
                }]),'progress' => static function () use ($cancellation): void {
                    $cancellation?->throwIfCancelled();
                }]);
            if ($response->getStatusCode() !== 200) {
                throw new ConnectionException('WhatsApp media download failed.', 'media_download_failed', status:$response->getStatusCode());
            }
            $cancellation?->throwIfCancelled();
            return self::decrypt($downloaded, $descriptor, $maxBytes);
        } catch (TransferException) {
            $cancellation?->throwIfCancelled();
            throw new ConnectionException('WhatsApp media download failed.', 'media_download_failed');
        }
    }
    public static function isKind(string $mediaKind): bool
    {
        return isset(self::FIELDS[$mediaKind]);
    }
    private static function varint(string $raw, int &$offset): int
    {
        $value = 0;
        for ($shift = 0;$shift < 63;$shift += 7) {
            if ($offset >= strlen($raw)) {
                self::invalid();
            }
            $byte = ord($raw[$offset++]);
            $value |= ($byte & 127) << $shift;
            if (($byte & 128) === 0) {
                return $value;
            }
        }
        self::invalid();
    }
    private static function invalid(): never
    {
        throw new MediaIntegrityException('Invalid media descriptor.', 'media_invalid_descriptor');
    }
    private static function fail(string $code): never
    {
        throw new MediaIntegrityException('WhatsApp media integrity verification failed.', $code);
    }
}
