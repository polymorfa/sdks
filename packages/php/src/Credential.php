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
            'organization_api_key' => self::opaqueShape($value, 'pmfa_'),
            'project_token' => self::opaqueShape($value, 'pmfa_pt_'),
            'client_token' => self::clientShape($value),
            default => false,
        };
        if (!$valid) {
            throw new ConfigurationException('credential');
        }
        if (PHP_OS_FAMILY === 'Unknown' && str_contains(PHP_SAPI, 'wasm') && $kind !== 'client_token') {
            throw new ConfigurationException('runtime');
        }
    }

    private static function clientShape(string $value): bool
    {
        if (!str_starts_with($value, 'pmfa_ct_')) return false;
        $body = substr($value, 8);
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $body)) return false;
        $raw = base64_decode(strtr($body, '-_', '+/'), true);
        return $raw !== false && rtrim(strtr(base64_encode($raw), '+/', '-_'), '=') === $body;
    }

    // Framing only; the API authenticates this credential.
    private static function opaqueShape(string $value, string $prefix): bool
    {
        if (!str_starts_with($value, $prefix)) {
            return false;
        }
        $body = substr($value, strlen($prefix));
        if (!preg_match('/^[A-Za-z0-9_-]+$/D', $body)) {
            return false;
        }
        $raw = base64_decode(strtr($body, '-_', '+/'), true);
        return $raw !== false && strlen($raw) >= 24 && pack('N', crc32(substr($raw, 0, -4))) === substr($raw, -4)
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
