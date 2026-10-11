<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\Psr7\StreamDecoratorTrait;
use Psr\Http\Message\StreamInterface;

/** Read a handed-off media body once. Body failures never restart the download. */
final class MediaBodyStream implements StreamInterface
{
    use StreamDecoratorTrait;
    private StreamInterface $stream;
    public function __construct(StreamInterface $stream, private readonly ResponseMetadata $metadata, private readonly ?CancellationToken $cancellation)
    {
        $this->stream = $stream;
    }
    public function read($length): string
    {
        $this->cancellation?->throwIfCancelled();
        try {
            $chunk = $this->stream->read($length);
        } catch (\RuntimeException) {
            $this->cancellation?->throwIfCancelled();
            throw new ConnectionException('The media response body could not be read.', 'connection_error', status:$this->metadata->status, requestId:$this->metadata->requestId, metadata:$this->metadata);
        }
        $this->cancellation?->throwIfCancelled();
        return $chunk;
    }
    /** @phpstan-impure */
    public function eof(): bool
    {
        return $this->stream->eof();
    }
    public function getContents(): string
    {
        $bytes = '';
        while (!$this->eof()) {
            $chunk = $this->read(65536);
            if ($chunk === '' && !$this->eof()) {
                throw new ConnectionException('The media response body stopped advancing.', 'connection_error', metadata:$this->metadata);
            }$bytes .= $chunk;
        }return $bytes;
    }
}
