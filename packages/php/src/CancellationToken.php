<?php

declare(strict_types=1);

namespace Polymorfa;

final class CancellationToken
{
    private bool $cancelled = false;
    private ?float $deadline = null;
    /** @var list<self> */
    private array $parents = [];

    public static function linked(self ...$parents): self
    {
        $token = new self();
        $token->parents = array_values($parents);
        return $token;
    }

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
        if ($this->cancelled || ($this->deadline !== null && microtime(true) >= $this->deadline)) {
            return true;
        }
        foreach ($this->parents as $parent) {
            if ($parent->isCancelled()) {
                return true;
            }
        }
        return false;
    }
    public function throwIfCancelled(): void
    {
        if ($this->isCancelled()) {
            throw new CancelledException('Request cancelled.', code: 'request_cancelled');
        }
    }
}
