<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\Psr7\StreamDecoratorTrait;
use Psr\Http\Message\StreamInterface;

/** @internal Forward-only reader; failures stay attached to the prepared body. */
final class TrackedEncryptedUploadStream implements StreamInterface
{
    use StreamDecoratorTrait;
    private bool $closed = false;
    private int $consumed = 0;
    /** @param \Closure(bool):void $report */
    public function __construct(private EncryptedUploadStream $stream, private readonly int $length, private readonly CancellationToken $cancellation, private readonly \Closure $report)
    {
    }
    public function read(int $length): string
    {
        try {
            if ($this->closed || $length < 0) {
                throw new MediaIntegrityException('The encrypted source is not readable.', 'media_source_failed');
            }
            $this->cancellation->throwIfCancelled();
            $data = $this->stream->read($length);
            $this->cancellation->throwIfCancelled();
            $this->consumed += strlen($data);
            if ($this->consumed > $this->length || ($length > 0 && $data === '' && $this->consumed !== $this->length)) {
                throw new MediaIntegrityException('The encrypted source ended unexpectedly.', 'media_source_failed');
            }
            $this->verifyIfComplete();
            return $data;
        } catch (\Throwable $error) {
            ($this->report)(false);
            if ($error instanceof PolymorfaException) {
                throw $error;
            }
            throw new MediaIntegrityException('The encrypted source could not be read.', 'media_source_failed');
        }
    }
    /** @internal */
    public function verifyIfComplete(): void
    {
        if ($this->consumed === $this->length) {
            $this->stream->complete();
            ($this->report)(true);
        }
    }
    public function getContents(): string
    {
        $bytes = '';
        while ($this->consumed < $this->length) {
            $bytes .= $this->read(min(65536, $this->length - $this->consumed));
        }
        return $bytes;
    }
    public function __toString(): string
    {
        try {
            return $this->getContents();
        } catch (\Throwable) {
            return '';
        }
    }
    public function isSeekable(): bool
    {
        return false;
    }
    public function seek(int $offset, int $whence = SEEK_SET): void
    {
        ($this->report)(false);
        throw new \RuntimeException('The encrypted upload stream cannot seek.');
    }
    public function rewind(): void
    {
        $this->seek(0);
    }
    public function detach(): mixed
    {
        $this->close();
        return null;
    }
    public function close(): void
    {
        if (!$this->closed) {
            $this->closed = true;
            $this->stream->close();
        }
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
