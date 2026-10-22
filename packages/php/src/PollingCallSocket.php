<?php

declare(strict_types=1);

namespace Polymorfa;

interface PollingCallSocket extends CallSocket
{
    /** A null result is an idle timeout, not a disconnected socket.
     * @return array{data:string,binary:bool}|null */
    public function poll(float $timeout): ?array;
}
