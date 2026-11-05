<?php

declare(strict_types=1);

namespace Polymorfa;

use Illuminate\Http\Request as LaravelRequest;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Message\StreamInterface;
use Symfony\Component\HttpFoundation\Request as SymfonyRequest;

/** Verify exact bounded request bytes. Ingress/framework buffering remains caller-owned. */
final class WebhookRequest
{
    public const DEFAULT_MAX_BODY_BYTES = 1048576;

    public static function fromSymfony(SymfonyRequest $request, #[\SensitiveParameter] string $secret, int $maxBodyBytes = self::DEFAULT_MAX_BODY_BYTES): WebhookEvent
    {
        self::validateLength($request->headers->all('content-length'), $maxBodyBytes);
        try {
            $resource = @$request->getContent(true);
            if (!is_resource($resource)) {
                self::invalidBody();
            }
            $metadata = stream_get_meta_data($resource);
            if ($metadata['seekable'] && @fseek($resource, 0) !== 0 || @ftell($resource) !== 0) {
                self::invalidBody();
            }
        } catch (\Throwable) {
            self::invalidBody();
        }
        $read = static function (int $count) use ($resource): string|false {
            if ($count < 1) {
                self::invalidBody();
            }
            return @fread($resource, $count);
        };
        $body = self::readBounded($read, static fn (): bool => feof($resource), $maxBodyBytes);
        return Webhooks::constructEvent($body, $request->headers->get('x-webhook-signature', '') ?? '', $secret);
    }

    public static function fromLaravel(LaravelRequest $request, #[\SensitiveParameter] string $secret, int $maxBodyBytes = self::DEFAULT_MAX_BODY_BYTES): WebhookEvent
    {
        return self::fromSymfony($request, $secret, $maxBodyBytes);
    }

    public static function fromPsr(ServerRequestInterface $request, #[\SensitiveParameter] string $secret, int $maxBodyBytes = self::DEFAULT_MAX_BODY_BYTES): WebhookEvent
    {
        self::validateLength($request->getHeader('content-length'), $maxBodyBytes);
        try {
            $stream = $request->getBody();
            self::rewindPsr($stream);
        } catch (\Throwable) {
            self::invalidBody();
        }
        $body = self::readBounded($stream->read(...), $stream->eof(...), $maxBodyBytes);
        return Webhooks::constructEvent($body, $request->getHeaderLine('x-webhook-signature'), $secret);
    }

    /** @param array<string|null> $lengths */
    private static function validateLength(array $lengths, int $maximum): void
    {
        if ($maximum <= 0) {
            throw new ConfigurationException('maxBodyBytes');
        }
        if ($lengths === []) {
            return;
        }
        $lengths = array_values($lengths);
        if (count($lengths) !== 1 || !is_string($lengths[0]) || preg_match('/\A[0-9]+\z/', $lengths[0]) !== 1) {
            throw new ValidationException('Invalid Content-Length.', 'invalid_content_length', status:400);
        }
        $length = ltrim($lengths[0], '0');
        $limit = (string)$maximum;
        if (strlen($length) > strlen($limit) || strlen($length) === strlen($limit) && strcmp($length, $limit) > 0) {
            self::tooLarge();
        }
    }

    private static function rewindPsr(StreamInterface $stream): void
    {
        if (!$stream->isReadable()) {
            self::invalidBody();
        }
        if ($stream->isSeekable()) {
            $stream->rewind();
        }
        // Nonseekable bodies must prove the complete original body is unconsumed.
        if ($stream->tell() !== 0) {
            self::invalidBody();
        }
    }

    /** @param callable(int):(string|false) $read
     * @param callable():bool $eof */
    private static function readBounded(callable $read, callable $eof, int $maximum): string
    {
        $body = '';
        while (true) {
            $remaining = $maximum - strlen($body);
            // Add one only below 8192, never to PHP_INT_MAX.
            $count = $remaining >= 8192 ? 8192 : $remaining + 1;
            try {
                $chunk = $read($count);
            } catch (\Throwable) {
                self::invalidBody();
            }
            if ($chunk === false || strlen($chunk) > $count) {
                self::invalidBody();
            }
            if (strlen($chunk) > $remaining) {
                self::tooLarge();
            }
            try {
                $finished = $eof();
            } catch (\Throwable) {
                self::invalidBody();
            }
            if ($chunk === '' && !$finished) {
                self::invalidBody();
            }
            $body .= $chunk;
            if ($finished) {
                return $body;
            }
        }
    }

    private static function tooLarge(): never
    {
        throw new ValidationException('Webhook body exceeds the configured limit.', 'webhook_body_too_large', status:413);
    }

    private static function invalidBody(): never
    {
        throw new ValidationException('Cannot read the complete webhook body.', 'invalid_webhook_body', status:400);
    }
}
