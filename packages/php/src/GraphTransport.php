<?php

declare(strict_types=1);

namespace Polymorfa;

final class GraphTransport
{
    private function __construct()
    {
    }

    /** @param 'auto'|'linked_devices'|'official_api' $transport
     * @return array{'X-Polymorfa-Transport':'auto'|'linked_devices'|'official_api'} */
    public static function headers(string $transport): array
    {
        self::validate($transport);
        return ['X-Polymorfa-Transport' => $transport];
    }

    private static function validate(string $transport): void
    {
        if (!in_array($transport, ['auto','linked_devices','official_api'], true)) {
            throw new ValidationException('Unknown Graph transport.', 'invalid_transport');
        }
    }
}
