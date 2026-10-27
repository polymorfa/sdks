<?php

declare(strict_types=1);

namespace Polymorfa;

/** A server or client credential with an optional Unix epoch expiry in seconds. */
final readonly class CallsToken
{
    public function __construct(public Credential $credential, public ?float $expiresAt = null)
    {
        if ($expiresAt !== null && !is_finite($expiresAt)) {
            throw new ConfigurationException('expiresAt');
        }
    }
    /** @return array{kind:string,expiresAt:?float} */
    public function __debugInfo(): array
    {
        return ['kind' => $this->credential->kind,'expiresAt' => $this->expiresAt];
    }
}
