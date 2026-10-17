<?php

declare(strict_types=1);

namespace Polymorfa;

use Psr\Http\Message\StreamInterface;
use GuzzleHttp\Psr7\{StreamDecoratorTrait,PumpStream};

/** Read once; closing interrupts the owned encrypted source and releases the generator. */
final class WhatsAppDecryptBody implements StreamInterface
{
    use StreamDecoratorTrait;
    private StreamInterface $stream;
    /** @var \Generator<int,string>|null */
    private ?\Generator $chunks;
    private string $pending = '';
    private bool $started = false;
    private bool $closed = false;
    /** @param 'before-release'|'streaming' $verify */
    public function __construct(private readonly StreamInterface $source, MediaDescriptor $descriptor, int $maxBytes = WhatsAppMedia::MAX_BYTES, string $verify = 'before-release', ?CancellationToken $cancellation = null)
    {
        $this->chunks = WhatsAppMedia::decryptChunks($source, $descriptor, $maxBytes, $verify, $cancellation);
        $this->stream = new PumpStream(function (int $length): string|false {
            if ($this->closed || $this->chunks === null) {
                return false;
            }
            while ($this->pending === '') {
                if ($this->started) {
                    $this->chunks->next();
                } else {
                    $this->chunks->rewind();
                    $this->started = true;
                }
                if (!$this->chunks->valid()) {
                    return false;
                }
                $this->pending = $this->chunks->current();
            }
            $chunk = substr($this->pending, 0, $length);
            $this->pending = substr($this->pending, strlen($chunk));
            return $chunk;
        });
    }
    public function close(): void
    {
        $this->closed = true;
        $this->source->close();
        $this->chunks = null;
        $this->pending = '';
        $this->stream->close();
    }
    /** @return array{closed:bool} */
    public function __debugInfo(): array
    {
        return ['closed' => $this->closed];
    }
}
