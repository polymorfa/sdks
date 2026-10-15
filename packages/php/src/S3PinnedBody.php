<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\Psr7\{StreamDecoratorTrait,Utils};
use Psr\Http\Message\StreamInterface;

/** Owned forward-only object body with an exact HEAD length and bounded EOF check. */
final class S3PinnedBody implements StreamInterface
{
    use StreamDecoratorTrait;
    private int $count = 0;
    /** @param \Closure():void $check */
    public function __construct(private StreamInterface $stream, private readonly int $expected, private readonly \Closure $check)
    {
    }
    public function read($length): string
    {
        ($this->check)();
        if ($length === 0) {
            return '';
        } if ($length < 0) {
            throw new \RuntimeException('Invalid stream read length.');
        }
        try {
            $chunk = $this->stream->read(min($length, max(1, $this->expected - $this->count + 1)));
        } catch (PolymorfaException $error) {
            throw $error;
        } catch (\Throwable) {
            ($this->check)();
            throw new MediaIntegrityException('The stored media source could not be read.', 'media_source_failed');
        }
        $this->count += strlen($chunk);
        if ($this->count > $this->expected) {
            throw new MediaIntegrityException('The stored media length changed.', 'media_source_changed');
        }
        if ($chunk === '' && !$this->stream->eof()) {
            throw new MediaIntegrityException('The stored media source stopped advancing.', 'media_source_failed');
        }
        if ($this->stream->eof() && $this->count !== $this->expected) {
            throw new MediaIntegrityException('The stored media length changed.', 'media_source_changed');
        }
        return $chunk;
    }
    public function eof(): bool
    {
        ($this->check)();
        $ended = $this->stream->eof();
        if ($ended && $this->count !== $this->expected) {
            throw new MediaIntegrityException('The stored media length changed.', 'media_source_changed');
        } return $ended;
    }
    public function getContents(): string
    {
        return Utils::copyToString($this);
    }
    public function isSeekable(): bool
    {
        return false;
    }
    public function seek($offset, $whence = SEEK_SET): void
    {
        throw new \RuntimeException('Stored media streams are read once.');
    }
    public function rewind(): void
    {
        $this->seek(0);
    }
    public function getSize(): int
    {
        return $this->expected;
    }
    /** @return array{redacted:true} */ public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
