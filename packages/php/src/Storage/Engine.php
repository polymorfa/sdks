<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\CancellationToken;

/** Durable per-session CAS leases and deterministic resumable schema2 writes. */
final class Engine
{
    /**
     * @var \Closure():(int|float) */
    private readonly \Closure $now;
    private readonly int $chunkSize;

    /**
     * @param (callable():(int|float))|null $now */
    public function __construct(public readonly Adapter $adapter, private readonly int $maxRetries = 8, private readonly int $clearPageSize = 200, private readonly float $leaseDurationMs = 30000, private readonly float $leaseWaitMs = 30000, ?callable $now = null)
    {
        $caps = $adapter->capabilities();
        if (!$caps['atomicCommit'] || $caps['maxCommitSize'] < 2 || $maxRetries < 0 || $maxRetries > 100 || $clearPageSize < 1 || $clearPageSize > 10000 || !is_finite($leaseDurationMs) || $leaseDurationMs <= 0 || !is_finite($leaseWaitMs) || $leaseWaitMs < 0) {
            Schema::invalid();
        }
        $this->chunkSize = $caps['maxCommitSize'] - 1;
        $this->now = $now === null ? static fn (): float => microtime(true) * 1000 : \Closure::fromCallable($now);
    }

    /**
     * @return array<string,mixed> */
    private function acquire(string $session, ?CancellationToken $cancellation): array
    {
        $id = Schema::encodeKey('leases', ['sessionId' => $session]);
        $owner = bin2hex(random_bytes(16));
        $deadline = hrtime(true) / 1000000 + $this->leaseWaitMs;
        do {
            $cancellation?->throwIfCancelled();
            $before = $this->adapter->get('leases', [$id], $cancellation)[$id] ?? null;
            if ($before === null || !($before['owner'] ?? null) || ($before['expiresAt'] ?? 0) <= ($this->now)()) {
                $row = $before ?? Rows::empty('leases', ['sessionId' => $session]);
                $row['_rev']++;
                $row['owner'] = $owner;
                $row['expiresAt'] = ($this->now)() + $this->leaseDurationMs;
                if ($this->adapter->commit([['kind' => 'put', 'entity' => 'leases', 'row' => $row, 'expectedRev' => $before['_rev'] ?? null]], $cancellation)['ok']) {
                    return $row;
                }
            }
            if (hrtime(true) / 1000000 >= $deadline) {
                throw new StorageException('storage_lease_lost');
            }
            usleep(5000);
        } while (true);
    }

    /**
     * @param array<string,mixed> $lease
     * @param list<array<string,mixed>> $writes
     * @return array{ok:true}|array{ok:false,conflicts:list<string>} */
    private function fenced(array &$lease, array $writes, ?CancellationToken $cancellation): array
    {
        $cancellation?->throwIfCancelled();
        if (($lease['expiresAt'] ?? 0) <= ($this->now)()) {
            throw new StorageException('storage_lease_lost');
        }
        $row = $lease;
        $row['_rev']++;
        $row['expiresAt'] = ($this->now)() + $this->leaseDurationMs;
        $writes[] = ['kind' => 'put', 'entity' => 'leases', 'row' => $row, 'expectedRev' => $lease['_rev']];
        $result = $this->adapter->commit($writes, $cancellation);
        if ($result['ok']) {
            $lease = $row;
        } elseif (in_array($lease['_id'], $result['conflicts'], true)) {
            throw new StorageException('storage_lease_lost');
        }
        return $result;
    }

    /**
     * @param list<string> $ids
     * @return array<string,array<string,mixed>> */
    private function read(string $entity, array $ids, ?CancellationToken $cancellation): array
    {
        $rows = [];
        foreach (array_chunk($ids, 1000) as $chunk) {
            $rows += $this->adapter->get($entity, $chunk, $cancellation);
        }
        return $rows;
    }

    /**
     * @param Upsert|Delete|Checkpoint $operation
     * @return array{string,string} */
    private static function identity(Upsert|Delete|Checkpoint $operation): array
    {
        return $operation instanceof Checkpoint ? ['checkpoints', Schema::encodeKey('checkpoints', ['sessionId' => $operation->sessionId, 'stream' => $operation->stream])] : [$operation->entity, Schema::encodeKey($operation->entity, $operation->key)];
    }

    /**
     * @param list<Upsert|Delete|Checkpoint> $operations
     * @return list<array<string,mixed>> */
    private function plan(array $operations, ?CancellationToken $cancellation): array
    {
        $grouped = [];
        foreach ($operations as $operation) {
            [$entity, $id] = self::identity($operation);
            $grouped[$entity][$id] = true;
        }
        $original = [];
        $identities = [];
        foreach ($grouped as $entity => $ids) {
            $rows = $this->read($entity, array_keys($ids), $cancellation);
            foreach ($ids as $id => $_) {
                $slot = $entity."\0".$id;
                $original[$slot] = $rows[$id] ?? null;
                $identities[$slot] = [$entity, $id];
            }
        }
        $stored = $original;
        foreach ($operations as $operation) {
            [$entity, $id] = self::identity($operation);
            $slot = $entity."\0".$id;
            $current = $stored[$slot];
            if ($operation instanceof Delete) {
                $stored[$slot] = null;
            } elseif ($operation instanceof Checkpoint) {
                if ($operation->expectedCursor !== Unspecified::Value && ($current['cursor'] ?? null) !== $operation->expectedCursor) {
                    throw new StorageException('storage_checkpoint_conflict');
                }
                $row = $current ?? Rows::empty('checkpoints', ['sessionId' => $operation->sessionId, 'stream' => $operation->stream]);
                $row['cursor'] = $operation->cursor;
                $row['position'] = Rows::copy($operation->position);
                $row['updatedAt'] = $operation->updatedAt;
                $stored[$slot] = $row;
            } else {
                if ($current === null && $operation instanceof Patch) {
                    continue;
                }
                $stored[$slot] = Rows::merge($entity, $current ?? Rows::empty($entity, $operation->key), $operation->fields);
            }
        }
        $writes = [];
        foreach ($stored as $slot => $row) {
            [$entity, $id] = $identities[$slot];
            $before = $original[$slot];
            if ($row === null) {
                if ($before !== null) {
                    $writes[] = ['kind' => 'delete', 'entity' => $entity, 'id' => $id, 'expectedRev' => $before['_rev']];
                }
            } elseif ($before === null || Rows::canonical($row) !== Rows::canonical($before)) {
                $row['_rev'] = ($before['_rev'] ?? 0) + 1;
                $writes[] = ['kind' => 'put', 'entity' => $entity, 'row' => $row, 'expectedRev' => $before['_rev'] ?? null];
            }
        }
        return $writes;
    }

    /**
     * @param list<Upsert|Delete|Checkpoint> $operations
     * @param array<string,mixed> $lease
     * @param list<array<string,mixed>> $extra */
    private function applyRows(array $operations, array &$lease, ?CancellationToken $cancellation, array $extra = []): int
    {
        $groups = array_chunk($operations, max(500, $this->chunkSize));
        if ($groups === []) {
            $groups = [[]];
        } $count = 0;
        foreach ($groups as $index => $group) {
            for ($attempt = 0; ; $attempt++) {
                $writes = $this->plan($group, $cancellation);
                if ($index === count($groups) - 1) {
                    array_push($writes, ...$extra);
                }
                $failed = false;
                foreach (array_chunk($writes, $this->chunkSize) as $chunk) {
                    if (!$this->fenced($lease, $chunk, $cancellation)['ok']) {
                        $failed = true;
                        break;
                    }
                }
                if (!$failed) {
                    $count += count($writes);
                    break;
                }
                if ($attempt >= $this->maxRetries) {
                    throw new StorageException('storage_conflict');
                }
                $cancellation?->throwIfCancelled();
                usleep((int)(min(0.2, 0.005 * 2 ** $attempt) * 1000000));
            }
        }
        return $count;
    }

    /**
     * @param array<string,mixed> $lease */
    private function clear(ClearChat $operation, array &$lease, ?CancellationToken $cancellation): int
    {
        $count = 0;
        while (true) {
            $messages = $this->adapter->query('messages', ['index' => 'by_chat', 'equals' => ['sessionId' => $operation->sessionId, 'chatId' => $operation->chatId], 'limit' => $this->clearPageSize, 'range' => ['lte' => $operation->upTo]], $cancellation);
            if ($messages === []) {
                return $count;
            } $deletes = [];
            foreach ($messages as $message) {
                $key = ['sessionId' => $operation->sessionId, 'messageId' => $message['messageId']];
                foreach (['reactions', 'receipts', 'poll_votes'] as $entity) {
                    do {
                        $children = $this->adapter->query($entity, ['index' => 'by_message', 'equals' => $key, 'limit' => 500], $cancellation);
                        foreach (array_chunk($children, $this->chunkSize) as $chunk) {
                            $writes = array_map(static fn (array $row): array => ['kind' => 'delete', 'entity' => $entity, 'id' => $row['_id'], 'expectedRev' => $row['_rev']], $chunk);
                            if (!$this->fenced($lease, $writes, $cancellation)['ok']) {
                                throw new StorageException('storage_conflict');
                            }
                        }
                        $count += count($children);
                    } while (count($children) === 500);
                }
                $deletes[] = new Delete('media', $key);
                $deletes[] = new Delete('messages', $key);
            }
            $count += $this->applyRows($deletes, $lease, $cancellation);
        }
    }

    /**
     * @param list<Upsert> $operations
     * @return list<Upsert> */
    private function watermarks(array $operations, ?CancellationToken $cancellation): array
    {
        $ids = [];
        foreach ($operations as $op) {
            if ($op->guard !== null) {
                $ids[] = Schema::encodeKey('chats', ['sessionId' => $op->guard->sessionId, 'chatId' => $op->guard->chatId]);
            }
        }
        $chats = $this->read('chats', array_values(array_unique($ids)), $cancellation);
        $result = [];
        foreach ($operations as $operation) {
            $guard = $operation->guard;
            if ($guard === null) {
                $result[] = $operation;
                continue;
            }
            $chat = $chats[Schema::encodeKey('chats', ['sessionId' => $guard->sessionId, 'chatId' => $guard->chatId])] ?? [];
            $marks = array_values(array_filter([$chat['clearedAt'] ?? null, $chat['deletedAt'] ?? null], static fn (mixed $v): bool => (is_int($v) || is_float($v)) && is_finite((float)$v)));
            if ($marks === [] || $guard->timestamp > max($marks)) {
                $result[] = $operation;
            }
        }
        return $result;
    }

    public function apply(Batch $batch, ?CancellationToken $cancellation = null): ApplyResult
    {
        if ($batch->sessionId === '') {
            Schema::invalid();
        }
        foreach ($batch->operations as $op) {
            $session = $op instanceof ClearChat || $op instanceof Checkpoint ? $op->sessionId : ($op->key['sessionId'] ?? null);
            if ($session !== $batch->sessionId || ($op instanceof Upsert && $op->guard !== null && $op->guard->sessionId !== $session) || (($op instanceof Upsert || $op instanceof Delete) && $op->entity === 'leases')) {
                Schema::invalid();
            }
            if ($op instanceof Upsert || $op instanceof Delete) {
                Schema::encodeKey($op->entity, $op->key);
            }
        }
        $lease = $this->acquire($batch->sessionId, $cancellation);
        try {
            $marker = [];
            if ($batch->eventId !== null) {
                $key = ['sessionId' => $batch->sessionId, 'eventId' => $batch->eventId];
                $id = Schema::encodeKey('events', $key);
                if (isset($this->adapter->get('events', [$id], $cancellation)[$id])) {
                    return new ApplyResult(false, 0);
                }
                $row = Rows::empty('events', $key);
                $row['_rev'] = 1;
                $row['type'] = $batch->eventType;
                $marker[] = ['kind' => 'put', 'entity' => 'events', 'row' => $row, 'expectedRev' => null];
            }
            $plain = [];
            $guarded = [];
            foreach ($batch->operations as $op) {
                if ($op instanceof ClearChat) {
                    continue;
                } if ($op instanceof Upsert && $op->guard !== null) {
                    $guarded[] = $op;
                } else {
                    $plain[] = $op;
                }
            }
            $writes = $this->applyRows($plain, $lease, $cancellation);
            foreach ($batch->operations as $op) {
                if ($op instanceof ClearChat) {
                    $writes += $this->clear($op, $lease, $cancellation);
                }
            }
            $writes += $this->applyRows($this->watermarks($guarded, $cancellation), $lease, $cancellation, $marker);
            return new ApplyResult(true, $writes);
        } finally {
            $row = $lease;
            $row['_rev']++;
            $row['owner'] = null;
            $row['expiresAt'] = 0;
            $this->adapter->commit([['kind' => 'put', 'entity' => 'leases', 'row' => $row, 'expectedRev' => $lease['_rev']]]);
        }
    }

    /**
     * @param array<string,string> $key
     * @return array<string,mixed>|null */
    public function get(string $entity, array $key, ?CancellationToken $cancellation = null): ?array
    {
        $id = Schema::encodeKey($entity, $key);
        $row = $this->adapter->get($entity, [$id], $cancellation)[$id] ?? null;
        if ($row === null) {
            return null;
        } unset($row['_id'], $row['_rev'], $row['_v']);
        return Rows::copy($row);
    }

    /**
     * @param array<string,mixed> $query
     * @return array{rows:list<array<string,mixed>>,nextCursor:array{sort:int|float,id:string}|null} */
    public function query(string $entity, array $query, ?CancellationToken $cancellation = null): array
    {
        $index = Schema::validateQuery($entity, $query, 100000);
        $rows = $this->adapter->query($entity, $query, $cancellation);
        $last = $rows !== [] && count($rows) >= $query['limit'] ? $rows[count($rows) - 1] : null;
        $cursor = $last === null ? null : ['sort' => $last[$index['sort']] ?? 0, 'id' => $last['_id']];
        foreach ($rows as &$row) {
            unset($row['_id'], $row['_rev'], $row['_v']);
        } unset($row);
        return ['rows' => Rows::copy($rows), 'nextCursor' => $cursor];
    }

    /**
     * @return array<string,mixed>|null */
    public function getCheckpoint(string $sessionId, string $stream): ?array
    {
        return $this->get('checkpoints', ['sessionId' => $sessionId, 'stream' => $stream]);
    }
    public function hasEvent(string $sessionId, string $eventId): bool
    {
        return $this->get('events', ['sessionId' => $sessionId, 'eventId' => $eventId]) !== null;
    }
}
