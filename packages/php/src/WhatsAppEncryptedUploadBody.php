<?php

declare(strict_types=1);

namespace Polymorfa;

use Polymorfa\Resources\WhatsAppMedia;
use Psr\Http\Message\StreamInterface;

/** Repeatable ciphertext||MAC. Plaintext, keys and credentials are never public. */
final class WhatsAppEncryptedUploadBody implements \JsonSerializable
{
    public readonly string $mediaType;
    public readonly string $fileEncSha256;
    public readonly int $encryptedLength;
    private bool $closed = false;
    private bool $completed = false;
    private bool $failed = false;
    /** @var list<TrackedEncryptedUploadStream> */
    private array $streams = [];
    /**
     * @internal
     * @param \Closure(?CancellationToken):StreamInterface $open
     * @param \Closure(WhatsAppMedia,string,string,UploadWhatsAppMediaOptions):WhatsAppUploadLocation $builtin
     */
    public function __construct(EncryptedMediaInfo $info, #[\SensitiveParameter] private readonly \Closure $open, #[\SensitiveParameter] private readonly \Closure $builtin, private readonly ?CancellationToken $cancellation = null)
    {
        $this->mediaType = $info->mediaType;
        $this->fileEncSha256 = $info->fileEncSha256;
        $this->encryptedLength = $info->encryptedLength;
    }
    public function open(int $offset = 0, ?CancellationToken $cancellation = null): StreamInterface
    {
        $stream = null;
        try {
            $this->check();
            if ($offset < 0 || $offset > $this->encryptedLength) {
                throw new ConfigurationException('offset');
            }
            $token = CancellationToken::linked(...array_values(array_filter([$this->cancellation, $cancellation])));
            $token->throwIfCancelled();
            $encrypted = ($this->open)($token);
            if (!$encrypted instanceof EncryptedUploadStream) {
                $encrypted->close();
                throw new MediaIntegrityException('The encrypted source could not be opened.', 'media_source_failed');
            }
            $stream = new TrackedEncryptedUploadStream($encrypted, $this->encryptedLength, $token, function (bool $success): void {
                if ($success) {
                    $this->completed = true;
                } else {
                    $this->failed = true;
                }
            });
            $this->streams[] = $stream;
            for ($left = $offset; $left > 0;) {
                $left -= strlen($stream->read(min(65536, $left)));
            }
            $stream->verifyIfComplete();
            return $stream;
        } catch (\Throwable $error) {
            $this->failed = true;
            $stream?->close();
            if ($error instanceof PolymorfaException) {
                throw $error;
            }
            throw new MediaIntegrityException('The encrypted source could not be opened.', 'media_source_failed');
        }
    }
    private function check(): void
    {
        if ($this->closed) {
            throw new MediaIntegrityException('The encrypted upload body is closed.', 'media_upload_closed');
        }
        $this->cancellation?->throwIfCancelled();
    }
    /** @internal The implementation stays inside the owning API resource. */
    public function uploadUsing(WhatsAppMedia $resource, string $session, string $mode, UploadWhatsAppMediaOptions $options): WhatsAppUploadLocation
    {
        try {
            $this->check();
            $result = ($this->builtin)($resource, $session, $mode, $options);
            $this->check();
            $this->completed = true;
            return $result;
        } catch (\Throwable $error) {
            $this->failed = true;
            throw $error;
        }
    }
    /** @internal Closes every outstanding stream, including abandoned retries. */
    public function finish(): bool
    {
        $this->closed = true;
        foreach ($this->streams as $stream) {
            try {
                $stream->close();
            } catch (\Throwable) {
                $this->failed = true;
            }
        }
        return $this->completed && !$this->failed;
    }
    public function __destruct()
    {
        $this->finish();
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{mediaType:string,fileEncSha256:string,encryptedLength:int} */
    public function jsonSerialize(): array
    {
        return ['mediaType' => $this->mediaType,'fileEncSha256' => base64_encode($this->fileEncSha256),'encryptedLength' => $this->encryptedLength];
    }
}
