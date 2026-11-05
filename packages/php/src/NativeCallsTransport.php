<?php

declare(strict_types=1);

namespace Polymorfa;

use WebSocket\Client;
use WebSocket\Message\Message;

/** @internal Public adapter seam around phrity's protected connection API. */
final class NativeCallsTransport extends Client
{
    public function receiveWithin(float $timeout): ?Message
    {
        $connection = $this->connection();
        $stream = $connection->getStream();
        $stream->setTimeout($timeout);
        $resource = $stream->getResource();
        if (!is_resource($resource)) {
            throw new ConnectionException('Calls socket is closed.', 'connection_error');
        }
        $read = [$resource];
        $write = [];
        $except = [];
        $seconds = (int)$timeout;
        $micros = (int)(($timeout - $seconds) * 1000000);
        $available = stream_select($read, $write, $except, $seconds, $micros);
        if ($available === false) {
            throw new ConnectionException('Calls socket poll failed.', 'connection_error');
        }
        return $available === 0 ? null : $connection->pullMessage();
    }
}
