<?php

declare(strict_types=1);

namespace Polymorfa;

final readonly class CallsOptions
{
    public function __construct(
        public ?string $session = null,
        public ?string $participant = null,
        public string $baseUrl = 'https://api.polymorfa.com',
        public float $connectTimeout = 10,
        public float $controlTimeout = 5,
        public float $heartbeat = 15,
        public float $refreshBeforeExpiry = 60,
        public float $minBackoff = 1,
        public float $maxBackoff = 30,
        public int $maxMediaReattach = 3,
        public bool $diagnostics = true,
        public float $mediaHeartbeat = 5
    ) {
        $parts = parse_url($baseUrl);
        if ($parts === false || !isset($parts['host'],$parts['scheme']) || !in_array($parts['scheme'], ['http','https'], true)
            || isset($parts['user']) || isset($parts['pass']) || isset($parts['query']) || isset($parts['fragment'])
            || !in_array($parts['path'] ?? '', ['','/'], true)
            || ($parts['scheme'] === 'http' && !in_array($parts['host'], ['localhost','127.0.0.1','[::1]'], true))) {
            throw new ConfigurationException('baseUrl');
        }
        foreach ([$connectTimeout,$controlTimeout,$minBackoff,$maxBackoff] as $seconds) {
            if (!is_finite($seconds) || $seconds <= 0) {
                throw new ConfigurationException('callsTimeout');
            }
        }
        foreach ([$heartbeat,$refreshBeforeExpiry,$mediaHeartbeat] as $seconds) {
            if (!is_finite($seconds) || $seconds < 0) {
                throw new ConfigurationException('callsTimeout');
            }
        }
        if ($maxBackoff < $minBackoff || $maxMediaReattach < 0 || $maxMediaReattach > 10 || ($session !== null && trim($session) === '')
            || ($participant !== null && !preg_match('/^[A-Za-z0-9._:@-]{1,128}$/D', $participant))) {
            throw new ConfigurationException('callsOptions');
        }
    }
}
