<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class Credential
{
    private function __construct(public string $kind, #[\SensitiveParameter] private string $value)
    {
        if ($kind === 'organization_api_key' && preg_match('/^pmfa_(pt|ct|ls|at|wst|sd)_/', $value)) {
            throw new ConfigurationException('credential');
        }
        $valid = match ($kind) {
            'organization_api_key' => self::signedV2Shape($value, 'pmfa_'),
            'project_token' => self::signedV2Shape($value, 'pmfa_pt_'),
            'client_token' => (bool) preg_match('/^pmfa_ct_.+$/D', $value),
            default => false,
        };
        if (!$valid) {
            throw new ConfigurationException('credential');
        }
        if (PHP_OS_FAMILY === 'Unknown' && str_contains(PHP_SAPI, 'wasm') && $kind !== 'client_token') {
            throw new ConfigurationException('runtime');
        }
    }

    // Framing only; the API authenticates this credential.
    private static function signedV2Shape(string $value, string $prefix): bool
    {
        if (strlen($value) > 16384 || !str_starts_with($value, $prefix)) {
            return false;
        }
        $body = substr($value, strlen($prefix));
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $body)) {
            return false;
        }
        $raw = base64_decode(strtr($body, '-_', '+/'), true);
        return $raw !== false && strlen($raw) >= 66 && ord($raw[0]) === 2
            && rtrim(strtr(base64_encode($raw), '+/', '-_'), '=') === $body;
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
