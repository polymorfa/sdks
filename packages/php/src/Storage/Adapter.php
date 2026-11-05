<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\CancellationToken;

/** Storage-only boundary. Engine/reducer policy remains shared above adapters. */
interface Adapter
{
    /** @return array{atomicCommit:bool,maxCommitSize:int} */
    public function capabilities(): array;
    /** @param list<string> $ids
     * @return array<string,array<string,mixed>> */
    public function get(string $entity, array $ids, ?CancellationToken $cancellation = null): array;
    /** @param list<array<string,mixed>> $writes
     * @return array{ok:true}|array{ok:false,conflicts:list<string>} */
    public function commit(array $writes, ?CancellationToken $cancellation = null): array;
    /** @param array<string,mixed> $query
     * @return list<array<string,mixed>> */
    public function query(string $entity, array $query, ?CancellationToken $cancellation = null): array;
}
