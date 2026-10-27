<?php

declare(strict_types=1);

namespace Polymorfa;

use Psr\Http\Message\StreamInterface;

/** Incremental AES-CBC/PKCS#7, SHA-256 and HMAC-SHA256(macKey, IV || ciphertext).
 * Cellar whatsapp-1049950004 WAMediaCrypto.js:75-101 appends the first ten MAC bytes. */
final class MediaEncryption
{
    /** @return \Generator<int,string,mixed,EncryptedMediaInfo>
     * The caller owns the source. expected verifies an immutable repeat pass before
     * the final ciphertext block and MAC are yielded. */
    public static function chunks(StreamInterface $source, string $mediaType, #[\SensitiveParameter] ?string $mediaKey = null, int $maxBytes = WhatsAppMedia::MAX_BYTES, ?string $mimeType = null, ?CancellationToken $cancellation = null, ?EncryptedMediaInfo $expected = null): \Generator
    {
        if (!in_array($mediaType, ['image','video','audio','ptt','document','sticker'], true)) {
            throw new ConfigurationException('mediaType');
        }
        if ($maxBytes < 1 || $maxBytes > 9007199254740991) {
            throw new ConfigurationException('maxBytes');
        }
        $mediaKey ??= random_bytes(32);
        $keys = WhatsAppMedia::deriveKeys($mediaKey, $mediaType);
        $iv = $keys['iv'];
        $plainHash = hash_init('sha256');
        $encryptedHash = hash_init('sha256');
        $mac = hash_init('sha256', HASH_HMAC, $keys['macKey']);
        hash_update($mac, $iv);
        $pending = '';
        $fileLength = $encryptedLength = 0;
        while (!self::sourceEnded($source)) {
            $cancellation?->throwIfCancelled();
            try {
                $chunk = $source->read(65536);
            } catch (\RuntimeException) {
                throw new MediaIntegrityException('The media source could not be read.', 'media_source_failed');
            }
            if ($chunk === '' && !self::sourceEnded($source)) {
                throw new MediaIntegrityException('The media source stopped without EOF.', 'media_source_failed');
            }
            $fileLength += strlen($chunk);
            if ($fileLength > $maxBytes) {
                throw new MediaIntegrityException('Media exceeds the configured limit.', 'media_too_large');
            }
            hash_update($plainHash, $chunk);
            $pending .= $chunk;
            $complete = intdiv(strlen($pending), 16) * 16;
            if ($complete !== 0) {
                $ciphertext = openssl_encrypt(substr($pending, 0, $complete), 'aes-256-cbc', $keys['cipherKey'], OPENSSL_RAW_DATA | OPENSSL_ZERO_PADDING, $iv);
                if ($ciphertext === false) {
                    throw new MediaIntegrityException('Media encryption failed.', 'media_invalid_ciphertext');
                }
                $iv = substr($ciphertext, -16);
                hash_update($mac, $ciphertext);
                hash_update($encryptedHash, $ciphertext);
                $encryptedLength += strlen($ciphertext);
                $pending = substr($pending, $complete);
                yield $ciphertext;
            }
        }
        $ciphertext = openssl_encrypt($pending, 'aes-256-cbc', $keys['cipherKey'], OPENSSL_RAW_DATA, $iv);
        if ($ciphertext === false) {
            throw new MediaIntegrityException('Media encryption failed.', 'media_invalid_ciphertext');
        }
        hash_update($mac, $ciphertext);
        $tail = $ciphertext.substr(hash_final($mac, true), 0, 10);
        hash_update($encryptedHash, $tail);
        $encryptedLength += strlen($tail);
        $info = new EncryptedMediaInfo($mediaType, $mediaKey, hash_final($plainHash, true), hash_final($encryptedHash, true), $fileLength, $encryptedLength, $mimeType);
        if ($expected !== null && ($info->fileLength !== $expected->fileLength || $info->encryptedLength !== $expected->encryptedLength || !hash_equals($info->fileSha256, $expected->fileSha256) || !hash_equals($info->fileEncSha256, $expected->fileEncSha256))) {
            throw new MediaIntegrityException('The media source changed between encryption passes.', 'media_source_changed');
        }
        $cancellation?->throwIfCancelled();
        yield $tail;
        return $info;
    }
    /** @phpstan-impure */
    private static function sourceEnded(StreamInterface $source): bool
    {
        return $source->eof();
    }
    public static function encrypt(#[\SensitiveParameter] string $plaintext, string $mediaType, #[\SensitiveParameter] ?string $mediaKey = null, int $maxBytes = WhatsAppMedia::MAX_BYTES, ?string $mimeType = null, ?CancellationToken $cancellation = null): EncryptedMedia
    {
        $chunks = self::chunks(\GuzzleHttp\Psr7\Utils::streamFor($plaintext), $mediaType, $mediaKey, $maxBytes, $mimeType, $cancellation);
        $ciphertext = '';
        foreach ($chunks as $chunk) {
            $ciphertext .= $chunk;
        }
        return new EncryptedMedia($chunks->getReturn(), $ciphertext);
    }
}
