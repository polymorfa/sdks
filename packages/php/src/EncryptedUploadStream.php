<?php

declare(strict_types=1);

namespace Polymorfa;

use GuzzleHttp\Psr7\{PumpStream,StreamDecoratorTrait};
use Psr\Http\Message\StreamInterface;

/** @internal A verified immutable repeat pass, with secret-safe failure state. */
final class EncryptedUploadStream implements StreamInterface
{
    use StreamDecoratorTrait;
    private StreamInterface $stream;
    private bool $verified = false;
    private bool $closed = false;
    private int $deliveredAtClose = 0;
    private ?PolymorfaException $failure = null;

    public function __construct(#[\SensitiveParameter] private readonly StreamInterface $source, private readonly EncryptedMediaInfo $info, int $maxBytes, ?CancellationToken $cancellation = null)
    {
        $chunks = MediaEncryption::chunks($source, $info->mediaType, $info->mediaKey, $maxBytes, $info->mimeType, $cancellation, $info);
        $started = false;
        $pending = '';
        $this->stream = new PumpStream(function (int $length) use ($chunks, &$started, &$pending): string|false {
            try {
                if (!$started) {
                    $chunks->rewind();
                    $started = true;
                }
                if ($pending === '') {
                    if (!$chunks->valid()) {
                        $this->verified = true;
                        return false;
                    }
                    $pending = $chunks->current();
                    $chunks->next();
                    if (!$chunks->valid()) {
                        $this->verified = true;
                    }
                }
                $data = substr($pending, 0, $length);
                $pending = substr($pending, strlen($data));
                return $data;
            } catch (PolymorfaException $error) {
                $this->failure = $error;
                throw $error;
            } catch (\Throwable) {
                $this->failure = new MediaIntegrityException('The encrypted source could not be read.', 'media_source_failed');
                throw $this->failure;
            }
        }, ['size' => $info->encryptedLength]);
    }
    public function complete(): void
    {
        if ($this->failure !== null) {
            throw $this->failure;
        }
        if (!$this->verified || ($this->closed ? $this->deliveredAtClose : $this->stream->tell()) !== $this->info->encryptedLength) {
            throw new MediaIntegrityException('The encrypted source was not fully verified.', 'media_source_failed');
        }
    }
    public function failure(): ?PolymorfaException
    {
        return $this->failure;
    }
    public function close(): void
    {
        if (!$this->closed) {
            $this->deliveredAtClose = $this->stream->tell();
            $this->closed = true;
            $this->source->close();
            $this->stream->close();
        }
    }
    public function __destruct()
    {
        $this->close();
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
