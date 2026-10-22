<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\{Client,ClientInterface};
use GuzzleHttp\Psr7\Utils;
use Psr\Http\Message\StreamInterface;
use Polymorfa\Resources\WhatsAppMedia as MediaResource;

/** Customer-owned S3-compatible storage, borrowing an optional official AWS client. */
final class S3MediaStore implements \JsonSerializable
{
    public function __construct(#[\SensitiveParameter] private ?object $client, private readonly string $bucket, private readonly string $prefix = '')
    {
        if ($client === null || !is_a($client, 'Aws\\S3\\S3Client') || $bucket === '' || strlen($bucket) > 255 || str_contains($bucket, "\0") || preg_match('//u', $prefix) !== 1) {
            throw new ConfigurationException('s3');
        }
    }
    private function key(string $key): string
    {
        $key = $this->prefix.$key;
        if ($key === $this->prefix || strlen($key) > 1024 || str_contains($key, "\0") || preg_match('//u', $key) !== 1) {
            throw new ConfigurationException('key');
        } return $key;
    }
    private static function check(?CancellationToken $token, float $deadline): float
    {
        $remaining = $deadline - hrtime(true) / 1e9;
        if ($remaining <= 0) {
            throw new TimeoutException('The media store operation timed out.', 'request_timeout');
        } $token?->throwIfCancelled();
        return $remaining;
    }
    /** @param array<string,mixed> $parameters
     * @return array<string,mixed> */
    private function request(string $method, #[\SensitiveParameter] array $parameters, ?CancellationToken $token, float $deadline, bool $stream = false): array
    {
        if ($this->client === null) {
            throw new ConnectionException('The media store is closed.', 'media_store_closed');
        }
        $seconds = self::check($token, $deadline);
        $parameters['@http'] = ['timeout' => $seconds,'read_timeout' => $seconds,'allow_redirects' => false,'stream' => $stream,'progress' => static function () use ($token, $deadline): void {
            self::check($token, $deadline);
        }];
        try {
            if (!is_callable([$this->client,$method])) {
                throw new ConfigurationException('s3');
            } $call = \Closure::fromCallable([$this->client,$method]);
            $response = $call($parameters);
            if (!is_object($response) || !is_callable([$response,'toArray'])) {
                throw new ConnectionException('The media store returned an invalid response.', 'media_store_failed');
            }
            $result = (\Closure::fromCallable([$response,'toArray']))();
            if (!is_array($result)) {
                throw new ConnectionException('The media store returned an invalid response.', 'media_store_failed');
            }
            try {
                self::check($token, $deadline);
            } catch (\Throwable $error) {
                if (($result['Body'] ?? null) instanceof StreamInterface) {
                    $result['Body']->close();
                } throw $error;
            } return $result;
        } catch (PolymorfaException $error) {
            throw $error;
        } catch (\Throwable) {
            self::check($token, $deadline);
            throw new ConnectionException('The media store request failed.', 'media_store_failed');
        }
    }
    public function uploadToWhatsApp(MediaResource $media, string $session, string $key, UploadWhatsAppMediaOptions $options): WhatsAppMediaUploadResult
    {
        $key = $this->key($key);
        $request = $options->requestOptions ?? new RequestOptions();
        $token = $request->cancellation;
        $deadline = hrtime(true) / 1e9 + ($request->timeout ?? 30);
        $head = $this->request('headObject', ['Bucket' => $this->bucket,'Key' => $key], $token, $deadline);
        $etag = $head['ETag'] ?? null;
        $length = $head['ContentLength'] ?? null;
        if (!is_string($etag) || $etag === '' || strpbrk($etag, "\r\n") !== false || !is_int($length) || $length < 0) {
            throw new MediaIntegrityException('The stored object requires a bounded length and stable ETag.', 'media_source_failed');
        }
        if ($length > $options->maxBytes) {
            throw new MediaIntegrityException('Stored media exceeds the byte limit.', 'media_too_large');
        }
        $mime = $options->mimeType ?? (is_string($head['ContentType'] ?? null) ? $head['ContentType'] : null);
        if ($mime !== null && (strlen($mime) > 255 || strpbrk($mime, "\r\n") !== false)) {
            throw new ConfigurationException('mimeType');
        }
        $source = function (?CancellationToken $sourceToken) use ($key, $etag, $length, $token, $deadline): StreamInterface {
            $result = $this->request('getObject', ['Bucket' => $this->bucket,'Key' => $key,'IfMatch' => $etag], $sourceToken ?? $token, $deadline, true);
            $body = $result['Body'] ?? null;
            if (!$body instanceof StreamInterface) {
                throw new MediaIntegrityException('The stored media source has no body.', 'media_source_failed');
            }
            if (($result['ETag'] ?? $etag) !== $etag || ($result['ContentLength'] ?? $length) !== $length) {
                $body->close();
                throw new MediaIntegrityException('The stored media source changed.', 'media_source_changed');
            }
            return new S3PinnedBody($body, $length, static function () use ($sourceToken, $token, $deadline): void {
                self::check($sourceToken ?? $token, $deadline);
            });
        };
        $request = $options->requestOptions ?? new RequestOptions();
        $bounded = new UploadWhatsAppMediaOptions($options->mediaType, $mime, $options->mediaKey, $options->egress, $options->maxBytes, new RequestOptions(self::check($token, $deadline), $request->maxNetworkRetries, $request->apiVersion, $request->idempotencyKey, $request->headers, $token), $options->http, $options->maxAttempts, $options->documentPartSize, $options->uploadTransport);
        try {
            return $media->upload($session, $source, $bounded);
        } catch (\Throwable $error) {
            self::check($token, $deadline);
            if ($error instanceof PolymorfaException) {
                throw $error;
            } throw new ConnectionException('The media store upload failed.', 'media_store_failed');
        }
    }
    /** @param array<string,string> $metadata
     * @return array<string,string> */
    private static function metadata(array $metadata, MediaDescriptor $descriptor): array
    {
        $out = [];
        foreach ($metadata as $key => $value) {
            $name = strtolower($key);
            if (preg_match('/^[a-z][a-z0-9-]{0,62}$/D', $name) !== 1 || preg_match('/(?:key|token|secret|authorization|cookie|credential|password|url)/i', $name) === 1 || preg_match('/^[\x20-\x7e]{0,1024}$/D', $value) !== 1) {
                throw new ConfigurationException('metadata');
            }
            foreach ([$descriptor->mediaKey,base64_encode($descriptor->mediaKey),rtrim(strtr(base64_encode($descriptor->mediaKey), '+/', '-_'), '='),bin2hex($descriptor->mediaKey)] as $secret) {
                if (str_contains($value, $secret) || ($secret === bin2hex($descriptor->mediaKey) && str_contains(strtolower($value), $secret))) {
                    throw new ConfigurationException('metadata');
                }
            }
            $out[$name] = $value;
        }
        $out['wa-media-kind'] = $descriptor->mediaKind;
        if ($descriptor->fileSha256 !== null) {
            $out['wa-file-sha256'] = bin2hex($descriptor->fileSha256);
        } if ($descriptor->fileName !== null) {
            $out['wa-file-name'] = str_replace(['%21','%27','%28','%29','%2A'], ["!","'","(",")","*"], rawurlencode($descriptor->fileName));
        }
        $size = 0;
        foreach ($out as $key => $value) {
            $size += strlen($key) + strlen($value);
        } if ($size > 2048) {
            throw new ConfigurationException('metadata');
        } return $out;
    }
    /** @param MediaDescriptor|array{type:string,media:string} $input */
    public function archive(#[\SensitiveParameter] MediaDescriptor|array $input, S3ArchiveOptions $options): S3ArchiveResult
    {
        if ($this->client === null) {
            throw new ConnectionException('The media store is closed.', 'media_store_closed');
        }
        $key = $this->key($options->key);
        $descriptor = $input instanceof MediaDescriptor ? $input : WhatsAppMedia::descriptor($input);
        $metadata = self::metadata($options->metadata, $descriptor);
        $mime = $descriptor->mimetype ?? WhatsAppMedia::defaultMimeType($descriptor->mediaKind);
        if (strlen($mime) > 255 || strpbrk($mime, "\r\n") !== false) {
            throw new ConfigurationException('mimeType');
        }
        $request = $options->requestOptions ?? new RequestOptions();
        $token = $request->cancellation;
        $deadline = hrtime(true) / 1e9 + ($request->timeout ?? 30);
        self::check($token, $deadline);
        $parent = $options->scratchDirectory ?? sys_get_temp_dir();
        if (!is_dir($parent) || !is_writable($parent)) {
            throw new ConfigurationException('scratchDirectory');
        }
        $directory = rtrim($parent, DIRECTORY_SEPARATOR).DIRECTORY_SEPARATOR.'polymorfa-s3-'.bin2hex(random_bytes(16));
        if (!mkdir($directory, 0700)) {
            throw new ConnectionException('The private media spool could not be created.', 'media_spool_failed');
        }
        $path = $directory.DIRECTORY_SEPARATOR.'verified';
        $body = null;
        try {
            $http = new S3DeadlineHttpClient($options->http ?? new Client(['allow_redirects' => false]), static fn (): float => self::check($token, $deadline));
            $download = WhatsAppMedia::downloadStream($descriptor, $options->maxBytes, 'streaming', $token, $http);
            $bytes = $download->writeToFile($path, false, $options->maxBytes, $token);
            self::check($token, $deadline);
            if ($descriptor->fileLength !== null && $bytes !== $descriptor->fileLength) {
                throw new MediaIntegrityException('The media length does not match its descriptor.', 'media_invalid_descriptor');
            }
            $file = fopen($path, 'rb');
            if ($file === false) {
                throw new ConnectionException('The verified media spool could not be read.', 'media_spool_failed');
            } $body = Utils::streamFor($file);
            $result = $this->request('putObject', ['Bucket' => $this->bucket,'Key' => $key,'Body' => $body,'ContentLength' => $bytes,'ContentType' => $mime,'Metadata' => $metadata], $token, $deadline);
            $etag = $result['ETag'] ?? null;
            return new S3ArchiveResult($this->bucket, $key, $bytes, $mime, is_string($etag) ? $etag : null);
        } catch (PolymorfaException $error) {
            self::check($token, $deadline);
            throw $error;
        } catch (\Throwable) {
            self::check($token, $deadline);
            throw new ConnectionException('The media archive operation failed.', 'media_store_failed');
        } finally {
            $body?->close();
            if (is_file($path)) {
                unlink($path);
            } rmdir($directory);
        }
    }
    public function close(): void
    {
        $this->client = null;
    }
    /** @return array{redacted:true} */ public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */ public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
