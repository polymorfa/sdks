<?php

declare(strict_types=1);

namespace Polymorfa;

/** Injectable wire connection; the default implementation uses phrity/websocket. */
interface CallSocket
{
    public function send(#[\SensitiveParameter] string $data, bool $binary = false): void;
    /** @return array{data:string,binary:bool} */
    public function receive(): array;
    public function close(): void;
}
