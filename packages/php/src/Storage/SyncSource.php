<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\{CancellationToken,WebhookEvent};

/** Application-owned cooperative source; open must enable manual acknowledgement. */
interface SyncSource
{
    /**
     * @return iterable<array{webhook:?WebhookEvent,cursor:string,streamId:string,sequence:int}> */
    public function open(?string $cursor, CancellationToken $cancellation): iterable;
    public function acknowledge(string $streamId, string $cursor, int $sequence, CancellationToken $cancellation): void;
    public function close(): void;
}
