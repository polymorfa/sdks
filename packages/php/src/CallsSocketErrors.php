<?php

declare(strict_types=1);

namespace Polymorfa;

/** @internal Never exposes socket close reasons or provider credentials. */
final class CallsSocketErrors
{
    public static function closed(int $status, string $reason = '', bool $media = false): PolymorfaException
    {
        return match($status) {
            4401 => new AuthenticationException('Calls credential refused.', 'authentication_failed'),
            4409 => new ConflictException('Call is claimed or ended.', strtolower($reason) === 'call claimed' ? 'call_claimed' : 'call_ended'),
            1000 => $media ? new ConflictException('Call ended.', 'call_ended') : new ConnectionException('Calls connection closed.', 'socket_closed'),
            4400,4403,1008,1009 => new AuthorizationException('Calls connection refused.', 'socket_refused'),
            4429 => new RateLimitException('Calls connection rate limited.', 'rate_limit_exceeded'),
            default => new ConnectionException('Calls connection closed.', 'connection_error'),
        };
    }
    public static function control(string $code): PolymorfaException
    {
        return match($code) {
            'invalid_token','authentication_failed','unauthorized' => new AuthenticationException('Calls credential refused.', $code),
            'call_claimed','call_ended' => new ConflictException('Call is claimed or ended.', $code),
            default => new AuthorizationException('Calls connection refused.', $code),
        };
    }
}
