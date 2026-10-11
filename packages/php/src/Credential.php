<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class Credential
{
    private function __construct(public string $kind, private string $value)
    {
        if ($kind === 'organization_api_key' && preg_match('/^pmfa_(pt|ct|ls|at|wst|sd)_/', $value)) {
            throw new ConfigurationException('credential');
        }
        $pattern = match ($kind) {
            'organization_api_key' => '/^pmfa_[A-Za-z0-9_-]{72}$/D',
            'project_token' => '/^pmfa_pt_[A-Za-z0-9_-]{93}[AQgw]$/D',
            'client_token' => '/^pmfa_ct_.+$/D',
            default => throw new ConfigurationException('credential'),
        };
        if (!preg_match($pattern, $value)) {
            throw new ConfigurationException('credential');
        }
        if (PHP_OS_FAMILY === 'Unknown' && str_contains(PHP_SAPI, 'wasm') && $kind !== 'client_token') {
            throw new ConfigurationException('runtime');
        }
    }

    public static function organizationApiKey(#[\SensitiveParameter] string $value): self
    {
        return new self('organization_api_key', $value);
    }

    public static function projectToken(#[\SensitiveParameter] string $value): self
    {
        return new self('project_token', $value);
    }

    public static function clientToken(#[\SensitiveParameter] string $value): self
    {
        return new self('client_token', $value);
    }

    public function authorization(): string
    {
        return 'Bearer ' . $this->value;
    }

    /**
 *
 * @return array{kind:string} */
    public function __debugInfo(): array
    {
        return ['kind' => $this->kind];
    }
}
