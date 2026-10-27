<?php

declare(strict_types=1);

namespace Polymorfa;

use Psr\Http\Message\StreamInterface;

/** @internal Binary upload body; ordinary endpoint bodies retain JSON encoding. */
final readonly class BinaryRequestBody implements \JsonSerializable
{
    /** @param \Closure(?CancellationToken):StreamInterface $open */
    public function __construct(#[\SensitiveParameter] public \Closure $open, public int $length, public string $contentType = 'application/octet-stream')
    {
        if ($length < 26 || $length > 9007199254740991) {
            throw new ConfigurationException('encryptedLength');
        }
    }
    /** @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
    /** @return array{redacted:true} */
    public function jsonSerialize(): array
    {
        return ['redacted' => true];
    }
}
