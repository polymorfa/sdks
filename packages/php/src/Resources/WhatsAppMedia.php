<?php

declare(strict_types=1);

namespace Polymorfa\Resources;

use GuzzleHttp\Client;
use GuzzleHttp\ClientInterface;
use GuzzleHttp\Exception\{RequestException,TransferException};
use GuzzleHttp\Psr7\{Request,Utils};
use Psr\Http\Message\StreamInterface;
use Polymorfa\{BuiltinWhatsAppMediaUploadTransport,WhatsAppEncryptedUploadBody,WhatsAppMediaUploadTransport,BinaryRequestBody,CancellationToken,ConfigurationException,ConnectionException,EncryptedMediaInfo,EncryptedUploadStream,MediaEncryption,MediaIntegrityException,PolymorfaException,RequestOptions,ServerException,TimeoutException,UploadWhatsAppMediaOptions,WhatsAppMedia as MediaCodec,WhatsAppMediaUploadResult,WhatsAppUploadGrant,WhatsAppUploadLocation};

final class WhatsAppMedia extends Resource
{
    public const API_VERSION = '2026-10-14';
    public static function options(?RequestOptions $options = null, ?float $timeout = null): RequestOptions
    {
        $options ??= new RequestOptions();
        return new RequestOptions($timeout ?? $options->timeout, 0, $options->apiVersion ?? self::API_VERSION, $options->idempotencyKey, $options->headers, $options->cancellation);
    }
    /** @return array{type:string,fileEncSha256:string,ptt?:bool} */
    private static function uploadRequest(string $kind, string $hash): array
    {
        if (!in_array($kind, ['image','video','audio','ptt','document','sticker'], true) || strlen($hash) !== 32) {
            throw new ConfigurationException('mediaType');
        }
        $type = match ($kind) {
            'document' => 'file', 'audio','ptt' => 'voice', default => $kind
        };
        $result = ['type' => $type, 'fileEncSha256' => self::hash($hash)];
        if ($type === 'voice') {
            $result['ptt'] = $kind === 'ptt';
        }
        return $result;
    }
    private static function hash(string $bytes): string
    {
        return rtrim(strtr(base64_encode($bytes), '+/', '-_'), '=');
    }
    /**
     * @param array<string,mixed> $data
     * @return array<string,mixed>
     */
    private static function unwrap(array $data): array
    {
        return isset($data['data']) && is_array($data['data']) ? $data['data'] : $data;
    }
    public function createUploadGrant(string $session, string $kind, string $fileEncSha256, ?RequestOptions $options = null): WhatsAppUploadGrant
    {
        $this->server();
        $response = $this->request('POST', '/messaging/'.self::segment($session).'/media/upload-grants', self::uploadRequest($kind, $fileEncSha256), options:self::options($options));
        $data = self::unwrap($response->data);
        $host = $data['host'] ?? null;
        $target = $data['uploadUrl'] ?? null;
        $expiry = $data['expiresAt'] ?? null;
        if (!is_string($host) || !is_string($target) || !is_int($expiry) || $expiry < 1 || $expiry > 8640000000000 || !MediaCodec::isMediaUrl($target)) {
            throw new ServerException('The API returned an invalid upload grant.', 'invalid_response');
        }
        $url = parse_url($target);
        parse_str($url['query'] ?? '', $query);
        if (($url['host'] ?? null) !== $host || isset($url['fragment']) || !isset($query['auth']) || !is_string($query['auth']) || $query['auth'] === '') {
            throw new ServerException('The API returned an invalid upload grant.', 'invalid_response');
        }
        return new WhatsAppUploadGrant($host, $target, $expiry);
    }
    /** @param \Closure(?CancellationToken):StreamInterface $open */
    public function relayUpload(string $session, EncryptedMediaInfo $info, #[\SensitiveParameter] \Closure $open, ?RequestOptions $options = null): WhatsAppUploadLocation
    {
        $query = self::uploadRequest($info->mediaType, $info->fileEncSha256);
        if (isset($query['ptt'])) {
            $query['ptt'] = $query['ptt'] ? 'true' : 'false';
        }
        $response = $this->request('POST', '/messaging/'.self::segment($session).'/media/uploads', new BinaryRequestBody($open, $info->encryptedLength), $query, \Polymorfa\ExistingContract::options($options, true)->withoutAutomaticRetry());
        $data = self::unwrap($response->data);
        return self::location($data, false);
    }
    /** @param array<string,mixed> $data */
    private static function location(array $data, bool $direct = true): WhatsAppUploadLocation
    {
        $path = $data[$direct ? 'direct_path' : 'directPath'] ?? null;
        $url = $data['url'] ?? null;
        $handle = $data['handle'] ?? null;
        if (!is_string($path) || $path === '' || !is_string($url) || $url === '') {
            throw new ServerException('The media host returned an invalid upload location.', 'invalid_response');
        }
        return new WhatsAppUploadLocation($path, $url, is_string($handle) && $handle !== '' ? $handle : null);
    }
    public function uploadBytes(string $session, #[\SensitiveParameter] string $plaintext, UploadWhatsAppMediaOptions $options): WhatsAppMediaUploadResult
    {
        return $this->upload($session, static fn (?CancellationToken $cancellation): StreamInterface => Utils::streamFor($plaintext), $options);
    }
    /** @param \Closure(?CancellationToken):StreamInterface $source Fresh immutable plaintext; SDK closes returned streams. */
    public function upload(string $session, #[\SensitiveParameter] \Closure $source, UploadWhatsAppMediaOptions $options): WhatsAppMediaUploadResult
    {
        if ($options->uploadTransport === null && $options->egress === 'direct') {
            $this->server();
        }
        if ($options->uploadTransport instanceof BuiltinWhatsAppMediaUploadTransport) {
            $options->uploadTransport->assertAllowed();
        }
        self::segment($session);
        $cancellation = $options->requestOptions?->cancellation;
        $first = self::openSource($source, $cancellation);
        try {
            $chunks = MediaEncryption::chunks($first, $options->mediaType, $options->mediaKey, $options->maxBytes, $options->mimeType, $cancellation);
            foreach ($chunks as $_) { /* Hashing pass releases no plaintext. */
            }
            $info = $chunks->getReturn();
        } finally {
            $first->close();
        }
        $egress = $options->egress;
        if ($options->uploadTransport !== null) {
            $extension = $options->uploadTransport;
            try {
                $egress = $extension->name();
            } catch (\Throwable) {
                throw new ConfigurationException('uploadTransport');
            }
            if (!preg_match('/^[A-Za-z0-9][A-Za-z0-9_.-]{0,63}$/D', $egress)) {
                throw new ConfigurationException('uploadTransport');
            }
            $deadline = hrtime(true) / 1e9 + ($options->requestOptions->timeout ?? 30);
            $token = CancellationToken::linked(...array_values(array_filter([$cancellation, CancellationToken::after($options->requestOptions->timeout ?? 30)])));
            $check = static function () use ($cancellation, $deadline, $token): void {
                $cancellation?->throwIfCancelled();
                if (hrtime(true) / 1e9 >= $deadline) {
                    throw new TimeoutException('The media upload timed out.', 'request_timeout');
                }
                $token->throwIfCancelled();
            };
            $open = static fn (?CancellationToken $child): StreamInterface => new EncryptedUploadStream(self::openSource($source, $child), $info, $options->maxBytes, $child);
            $body = new WhatsAppEncryptedUploadBody($info, $open, static function (self $resource, string $targetSession, string $mode, UploadWhatsAppMediaOptions $builtin) use ($source, $info, $options, $token): WhatsAppUploadLocation {
                $request = $builtin->requestOptions ?? new RequestOptions();
                $request = new RequestOptions($request->timeout, $request->maxNetworkRetries, $request->apiVersion, $request->idempotencyKey, $request->headers, CancellationToken::linked(...array_values(array_filter([$request->cancellation, $token]))));
                $policy = new UploadWhatsAppMediaOptions($info->mediaType, $info->mimeType, $info->mediaKey, $mode, $options->maxBytes, $request, $builtin->http, $builtin->maxAttempts, $builtin->documentPartSize);
                if ($mode === 'direct') {
                    $resource->assertDirectAllowed();
                    return $resource->directUpload($targetSession, $source, $info, $policy);
                }
                if ($mode !== 'relay') {
                    throw new ConfigurationException('egress');
                }
                return $resource->relayUpload($targetSession, $info, static fn (?CancellationToken $child): StreamInterface => new EncryptedUploadStream(self::openSource($source, $child), $info, $options->maxBytes, $child), $request);
            }, $token);
            try {
                try {
                    $location = $extension->upload($session, $body);
                } catch (\Throwable) {
                    $check();
                    throw new MediaIntegrityException('The custom encrypted upload transport failed.', 'media_upload_transport_failed');
                }
                $complete = $body->finish();
                $check();
                if (!$complete) {
                    throw new MediaIntegrityException('The transport did not consume a complete verified encrypted body.', 'media_upload_incomplete');
                }
                if ($location->directPath === '' || $location->url === '') {
                    throw new ServerException('The transport returned an invalid upload location.', 'invalid_response');
                }
            } finally {
                $body->finish();
            }
        } elseif ($options->egress === 'relay') {
            $location = $this->relayUpload($session, $info, static fn (?CancellationToken $token): StreamInterface => new EncryptedUploadStream(self::openSource($source, $token), $info, $options->maxBytes, $token), $options->requestOptions);
        } else {
            $location = $this->directUpload($session, $source, $info, $options);
        }
        return new WhatsAppMediaUploadResult($info, $location, $egress);
    }
    /** @internal Used by built-in transports, including wrapped transports. */
    public function assertDirectAllowed(): void
    {
        $this->server();
    }

    public function uploadTransport(string $mode, UploadWhatsAppMediaOptions $options): WhatsAppMediaUploadTransport
    {
        if ($mode === 'direct') {
            $this->server();
        }
        if (!in_array($mode, ['relay','direct'], true) || $options->uploadTransport !== null) {
            throw new ConfigurationException('uploadTransport');
        }
        return new BuiltinWhatsAppMediaUploadTransport($this, $mode, $options);
    }
    /** @param \Closure(?CancellationToken):StreamInterface $source */
    private static function openSource(#[\SensitiveParameter] \Closure $source, ?CancellationToken $cancellation): StreamInterface
    {
        $cancellation?->throwIfCancelled();
        try {
            return $source($cancellation);
        } catch (\Throwable) {
            $cancellation?->throwIfCancelled();
            throw new MediaIntegrityException('The media source could not be opened.', 'media_source_failed');
        }
    }
    /** @param array<string,string> $extra */
    private static function target(WhatsAppUploadGrant $grant, EncryptedMediaInfo $info, array $extra): string
    {
        $url = parse_url($grant->uploadUrl);
        $path = '/mms/'.$info->mediaType.'/'.self::hash($info->fileEncSha256);
        if ($url === false || !MediaCodec::isMediaUrl($grant->uploadUrl) || ($url['host'] ?? null) !== $grant->host || ($url['path'] ?? '') !== $path || isset($url['fragment'])) {
            throw new ServerException('The upload grant does not match the encrypted media.', 'invalid_response');
        }
        // Keep exact server-issued query pairs and only replace SDK-owned controls.
        $pairs = explode('&', $url['query'] ?? '');
        foreach ($extra as $name => $value) {
            $pairs = array_values(array_filter($pairs, static fn (string $pair): bool => rawurldecode(explode('=', $pair, 2)[0]) !== $name));
            $pairs[] = rawurlencode($name).'='.rawurlencode($value);
        }
        return 'https://'.$grant->host.$path.'?'.implode('&', $pairs);
    }
    /** @phpstan-impure */
    private static function ended(StreamInterface $stream): bool
    {
        return $stream->eof();
    }
    private static function remaining(float $deadline): float
    {
        $value = $deadline - hrtime(true) / 1e9;
        if ($value <= 0) {
            throw new TimeoutException('The media upload timed out.', 'request_timeout');
        }
        return $value;
    }
    /** @return array<string,mixed> */
    private static function post(ClientInterface $http, string $target, ?StreamInterface $body, int $length, float $deadline, ?CancellationToken $cancellation): array
    {
        $cancellation?->throwIfCancelled();
        $timeout = self::remaining($deadline);
        $headers = ['Origin' => 'https://web.whatsapp.com','Referer' => 'https://web.whatsapp.com/'];
        if ($body !== null) {
            $headers['Content-Length'] = (string) $length;
        }
        try {
            $response = $http->send(new Request('POST', $target, $headers, $body), ['headers' => null,'auth' => null,'cookies' => false,'allow_redirects' => false,'http_errors' => false,'timeout' => $timeout,'read_timeout' => $timeout,'stream' => true,'progress' => static function () use ($cancellation): void {
                $cancellation?->throwIfCancelled();
            }]);
        } catch (PolymorfaException $error) {
            throw $error;
        } catch (TransferException $error) {
            $cancellation?->throwIfCancelled();
            if ($body instanceof EncryptedUploadStream && $body->failure() !== null) {
                throw $body->failure();
            }
            $context = $error instanceof RequestException ? $error->getHandlerContext() : [];
            if (($context['errno'] ?? null) === 28) {
                throw new TimeoutException('The media upload timed out.', 'request_timeout');
            }
            // Causes contain signed URLs; retain neither cause nor provider body.
            throw new ConnectionException('The WhatsApp media host could not be reached.', 'connection_error');
        }
        try {
            $status = $response->getStatusCode();
            if ($status < 200 || $status >= 300) {
                $code = match ($status) {
                    401 => 'media_upload_unauthorized',413 => 'media_too_large',415 => 'media_upload_hash_mismatch',507 => 'media_upload_throttled',default => 'media_upload_failed'
                };
                throw new ServerException('The WhatsApp media host rejected the upload.', $code, status:$status);
            }
            $raw = '';
            while (!self::ended($response->getBody())) {
                $cancellation?->throwIfCancelled();
                self::remaining($deadline);
                try {
                    $chunk = $response->getBody()->read(65536);
                } catch (\RuntimeException) {
                    self::remaining($deadline);
                    if ($response->getBody()->getMetadata('timed_out') === true) {
                        throw new TimeoutException('The media upload timed out.', 'request_timeout');
                    }
                    throw new ConnectionException('The upload response could not be read.', 'connection_error');
                }
                if ($chunk === '' && !self::ended($response->getBody())) {
                    throw new ConnectionException('The upload response stopped without EOF.', 'connection_error');
                }
                $raw .= $chunk;
                if (strlen($raw) > 65536) {
                    throw new ServerException('The media host returned an invalid upload response.', 'invalid_response');
                }
            }
            if ($body instanceof EncryptedUploadStream) {
                $body->complete();
            }
            if ($raw === '') {
                return [];
            }
            try {
                $data = json_decode($raw, true, 64, JSON_THROW_ON_ERROR);
            } catch (\JsonException) {
                throw new ServerException('The media host returned invalid JSON.', 'invalid_response');
            }
            if (!is_array($data) || ($data !== [] && array_is_list($data))) {
                throw new ServerException('The media host returned invalid JSON.', 'invalid_response');
            }
            return $data;
        } finally {
            $response->getBody()->close();
        }
    }
    /**
     * @template T
     * @param \Closure(int):T $operation
     * @param \Closure():WhatsAppUploadGrant $refresh
     * @return T
     */
    private static function retry(\Closure $operation, \Closure $refresh, WhatsAppUploadGrant &$grant, int $attempts): mixed
    {
        $last = null;
        for ($attempt = 0; $attempt < $attempts; ++$attempt) {
            if ($attempt > 0 && $last->status === 401) {
                $grant = $refresh();
            }
            try {
                return $operation($attempt);
            } catch (PolymorfaException $error) {
                $last = $error;
                $status = $error->status;
                if (!($error instanceof ConnectionException || $status === 401 || $status === 408 || ($status !== null && $status >= 500 && $status !== 507))) {
                    throw $error;
                }
            }
        }
        throw $last ?? new ConnectionException('Media upload attempts exhausted.', 'connection_error');
    }
    /** @param \Closure(?CancellationToken):StreamInterface $source */
    private function directUpload(string $session, #[\SensitiveParameter] \Closure $source, EncryptedMediaInfo $info, UploadWhatsAppMediaOptions $options): WhatsAppUploadLocation
    {
        $this->server();
        $http = $options->http ?? new Client(['allow_redirects' => false]);
        $requestOptions = $options->requestOptions ?? new RequestOptions();
        $token = $requestOptions->cancellation;
        $deadline = hrtime(true) / 1e9 + ($requestOptions->timeout ?? 30);
        $refresh = fn (): WhatsAppUploadGrant => $this->createUploadGrant($session, $info->mediaType, $info->fileEncSha256, self::options($options->requestOptions, self::remaining($deadline)));
        $grant = $refresh();
        $post = static function (array $query, ?StreamInterface $stream, int $length) use ($http, &$grant, $info, $deadline, $token): array {
            return self::post($http, self::target($grant, $info, $query), $stream, $length, $deadline, $token);
        };
        if ($info->mediaType === 'document' && $info->encryptedLength > $options->documentPartSize) {
            $stream = new EncryptedUploadStream(self::openSource($source, $token), $info, $options->maxBytes, $token);
            try {
                for ($start = 0; $start < $info->encryptedLength; $start += $options->documentPartSize) {
                    $end = min($start + $options->documentPartSize, $info->encryptedLength);
                    $part = '';
                    $length = $end - $start;
                    while (strlen($part) < $length) {
                        $chunk = $stream->read($length - strlen($part));
                        if ($chunk === '') {
                            throw new MediaIntegrityException('The encrypted source ended prematurely.', 'media_source_failed');
                        } $part .= $chunk;
                    }
                    if ($end === $info->encryptedLength) {
                        $stream->complete();
                    }
                    self::retry(static fn (int $attempt): array => $post(['stream' => '1','bytestart' => (string) $start,'byteend' => (string) $end], Utils::streamFor($part), $length), $refresh, $grant, $options->maxAttempts);
                }
            } finally {
                $stream->close();
            }
            $result = self::retry(static fn (int $attempt): array => $post(['stream' => '1','final_hash' => self::hash($info->fileEncSha256)], null, 0), $refresh, $grant, $options->maxAttempts);
            return self::location($result);
        }
        $result = self::retry(static function (int $attempt) use ($post, $source, $info, $options, $token): array {
            $offset = 0;
            if ($attempt > 0) {
                try {
                    $progress = $post(['resume' => '1'], null, 0);
                } catch (ServerException $error) {
                    if ($error->status !== 404) {
                        throw $error;
                    } $progress = [];
                }
                $resume = $progress['resume'] ?? null;
                if ($resume === 'complete') {
                    return $progress;
                }
                if ((is_int($resume) && $resume > 0) || (is_string($resume) && preg_match('/^[1-9][0-9]*$/D', $resume) && strlen($resume) < 17)) {
                    $offset = (int) $resume;
                }
                if ($offset <= 0 || $offset >= $info->encryptedLength) {
                    $offset = 0;
                }
            }
            $stream = new EncryptedUploadStream(self::openSource($source, $token), $info, $options->maxBytes, $token);
            try {
                $remaining = $offset;
                while ($remaining > 0) {
                    $chunk = $stream->read(min(65536, $remaining));
                    if ($chunk === '') {
                        throw new MediaIntegrityException('The encrypted source ended prematurely.', 'media_source_failed');
                    } $remaining -= strlen($chunk);
                }
                return $post($offset > 0 ? ['bytestart' => (string) $offset,'byteend' => (string) $info->encryptedLength] : [], $stream, $info->encryptedLength - $offset);
            } finally {
                $stream->close();
            }
        }, $refresh, $grant, $options->maxAttempts);
        return self::location($result);
    }
}
