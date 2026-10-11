<?php

declare(strict_types=1);

namespace Polymorfa;

final class CancellationToken
{
    private bool $cancelled = false;
    private ?float $deadline = null;

    public static function after(float $seconds): self
    {
        if ($seconds < 0 || !is_finite($seconds)) {
            throw new ConfigurationException('cancellation');
        }
        $token = new self();
        $token->deadline = microtime(true) + $seconds;
        return $token;
    }
    public function cancel(): void
    {
        $this->cancelled = true;
    }
    public function isCancelled(): bool
    {
        return $this->cancelled || ($this->deadline !== null && microtime(true) >= $this->deadline);
    }
    public function throwIfCancelled(): void
    {
        if ($this->isCancelled()) {
            throw new CancelledException('Request cancelled.', code: 'request_cancelled');
        }
    }
}
