<?php

declare(strict_types=1);
namespace Polymorfa;
final class WebhookBatching
{
    /** @param array<string,mixed> $body */
    public static function validate(array $body): void
    {
        if (!array_key_exists('batching', $body)) { return; }
        $b = $body['batching'];
        if (!is_array($b) || !isset($b['enabled']) || !is_bool($b['enabled']) || array_diff(array_keys($b), ['enabled','maxEvents','windowMs']) !== []) { throw new ValidationException('Invalid webhook batching settings.'); }
        foreach ([['maxEvents',2,100],['windowMs',100,1000]] as [$key,$low,$high]) {
            if (array_key_exists($key, $b) && (!is_int($b[$key]) || $b[$key] < $low || $b[$key] > $high)) { throw new ValidationException('Invalid webhook batching bounds.'); }
        }
        if ($b['enabled'] && ($body['format'] ?? null) === 'meta') { throw new ValidationException('Webhook batching supports native format only.'); }
    }
}
