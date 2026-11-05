<?php

declare(strict_types=1);

use Polymorfa\CancellationToken;
use Polymorfa\Storage\{Adapter,Rows,Schema};

/** Test-only native in-memory adapter; atomic precondition validation precedes every write. */
class StorageEngineMemory implements Adapter
{
    public array $rows = [];
    public array $commits = [];
    public ?Closure $beforeCommit = null;
    public function __construct(private readonly int $batchSize = 50)
    {
    }
    public function capabilities(): array
    {
        return ['atomicCommit' => true,'maxCommitSize' => $this->batchSize];
    }
    public function get(string $entity, array $ids, ?CancellationToken $cancellation = null): array
    {
        $cancellation?->throwIfCancelled();
        $out = [];
        foreach ($ids as $id) {
            if (isset($this->rows[$entity][$id])) {
                $out[$id] = Rows::copy($this->rows[$entity][$id]);
            }
        } return $out;
    }
    public function commit(array $writes, ?CancellationToken $cancellation = null): array
    {
        $cancellation?->throwIfCancelled();
        Schema::validateWrites($writes, $this->batchSize);
        $this->commits[] = Rows::copy($writes);
        if ($this->beforeCommit !== null) {
            $result = ($this->beforeCommit)($writes, $this);
            if ($result !== null) {
                return $result;
            }
        }
        $conflicts = [];
        foreach ($writes as $write) {
            $id = $write['kind'] === 'put' ? $write['row']['_id'] : $write['id'];
            $before = $this->rows[$write['entity']][$id] ?? null;
            if (!array_key_exists('expectedRev', $write)) {
                throw new RuntimeException('test adapter requires conditional deletes');
            }
            if (($write['expectedRev'] === null && $before !== null) || ($write['expectedRev'] !== null && ($before['_rev'] ?? null) !== $write['expectedRev'])) {
                $conflicts[] = $id;
            }
        }
        if ($conflicts !== []) {
            return ['ok' => false,'conflicts' => $conflicts];
        }
        foreach ($writes as $write) {
            if ($write['kind'] === 'put') {
                $this->rows[$write['entity']][$write['row']['_id']] = Rows::copy($write['row']);
            } else {
                unset($this->rows[$write['entity']][$write['id']]);
            }
        }
        return ['ok' => true];
    }
    public function query(string $entity, array $query, ?CancellationToken $cancellation = null): array
    {
        $cancellation?->throwIfCancelled();
        $index = Schema::validateQuery($entity, $query, 100000);
        $rows = [];
        foreach ($this->rows[$entity] ?? [] as $row) {
            foreach ($query['equals'] as $key => $value) {
                if (($row[$key] ?? null) !== $value) {
                    continue 2;
                }
            }
            $sort = $row[$index['sort']] ?? 0;
            foreach ($query['range'] ?? [] as $name => $value) {
                if (!match($name) {
                    'gt' => $sort > $value,'gte' => $sort >= $value,'lt' => $sort < $value,'lte' => $sort <= $value
                }) {
                    continue 2;
                }
            }
            if (isset($query['after'])) {
                $cmp = ($sort <=> $query['after']['sort']) ?: Rows::compare($row['_id'], $query['after']['id']);
                if (($query['order'] ?? 'asc') === 'desc' ? $cmp >= 0 : $cmp <= 0) {
                    continue;
                }
            }
            $rows[] = $row;
        }
        usort($rows, static fn (array $a, array $b): int => (($a[$index['sort']] ?? 0) <=> ($b[$index['sort']] ?? 0)) ?: Rows::compare($a['_id'], $b['_id']));
        if (($query['order'] ?? 'asc') === 'desc') {
            $rows = array_reverse($rows);
        }
        return Rows::copy(array_slice($rows, 0, $query['limit']));
    }
}
