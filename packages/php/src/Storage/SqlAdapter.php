<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

use Polymorfa\{CancellationToken,CancelledException};

final class SqlAdapter implements Adapter
{
    private bool $ready = false;
    public function __construct(private readonly SqlDriver $driver, private readonly string $tablePrefix = 'polymorfa_', private readonly ?string $schema = null, private readonly bool $createTables = true)
    {
        SqlSchema::statements($driver->dialect(), $tablePrefix, $schema);
    }
    public static function pdo(\PDO $pdo, string $tablePrefix = 'polymorfa_', ?string $schema = null, bool $createTables = true): self
    {
        return new self(new PdoDriver($pdo), $tablePrefix, $schema, $createTables);
    }
    /**
     * @return array{atomicCommit:bool,maxCommitSize:int} */
    public function capabilities(): array
    {
        return ['atomicCommit' => $this->ready,'maxCommitSize' => 1000];
    }
    private function q(string $field): string
    {
        return SqlSchema::quote($this->driver->dialect(), SqlSchema::column($field));
    }
    private function table(string $entity): string
    {
        return SqlSchema::table($this->driver->dialect(), $entity, $this->tablePrefix, $this->schema);
    }
    private function check(): void
    {
        if (!$this->ready) {
            throw new StorageException('storage_not_initialized');
        }
    }
    private function mysql(bool $tables): void
    {
        if ($this->driver->dialect() !== 'mysql') {
            return;
        }
        $mode = (string)($this->driver->run('SELECT @@SESSION.sql_mode AS mode')->rows[0]['mode'] ?? '');
        if (array_intersect(explode(',', $mode), ['STRICT_TRANS_TABLES','STRICT_ALL_TABLES']) === []) {
            throw new StorageException('storage_mysql_strict_mode_required');
        }
        if (!$tables) {
            return;
        }
        $names = array_map(fn (string $entity): string => $this->tablePrefix.$entity, SqlSchema::ENTITIES);
        $rows = $this->driver->run('SELECT table_name AS name,engine AS engine FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name IN ('.implode(',', array_fill(0, count($names), '?')).')', $names)->rows;
        if (count($rows) !== count($names)) {
            throw new StorageException('storage_schema_mismatch');
        }
        foreach ($rows as $row) {
            if (strtoupper((string)$row['engine']) !== 'INNODB') {
                throw new StorageException('storage_mysql_innodb_required');
            }
        }
    }
    public function setup(): void
    {
        $this->ready = false;
        try {
            $this->driver->assertIdle();
            $this->mysql(false);
            $table = $this->table('storage_schema');
            $exists = match($this->driver->dialect()) {
                'postgres' => $this->driver->run('SELECT to_regclass(?) AS name', [$table])->rows[0]['name'] !== null,
                'mysql' => (int)$this->driver->run('SELECT COUNT(*) AS n FROM information_schema.tables WHERE table_schema=DATABASE() AND table_name=?', [$this->tablePrefix.'storage_schema'])->rows[0]['n'] > 0,
                default => (int)$this->driver->run("SELECT COUNT(*) AS n FROM sqlite_master WHERE type='table' AND name=?", [$this->tablePrefix.'storage_schema'])->rows[0]['n'] > 0,
            };
            $rows = $exists ? $this->driver->run('SELECT '.$this->q('version').' FROM '.$table.' WHERE '.$this->q('id').'=?', ['storage'])->rows : [];
            if ($rows !== [] && (int)$rows[0]['version'] !== Schema::VERSION) {
                throw new StorageException('storage_schema_mismatch');
            }
            if (!$this->createTables && $rows === []) {
                throw new StorageException('storage_not_initialized');
            }
            if ($this->createTables) {
                foreach (SqlSchema::statements($this->driver->dialect(), $this->tablePrefix, $this->schema) as $statement) {
                    $this->driver->run($statement);
                }
            }
            if ($rows === []) {
                $this->driver->run('INSERT INTO '.$table.' ('.$this->q('id').','.$this->q('version').') VALUES (?,?)', ['storage',Schema::VERSION]);
            }
            $this->mysql(true);
            $this->ready = true;
        } catch (\Throwable $error) {
            self::safe($error);
        }
    }
    private static function safe(\Throwable $error): never
    {
        if ($error instanceof StorageException || $error instanceof CancelledException) {
            throw $error;
        } throw new StorageException('storage_sql_failed');
    }
    /**
     * @param array<string,mixed> $raw
     * @return array<string,mixed> */
    private function decode(string $entity, array $raw): array
    {
        $d = Schema::definition($entity);
        $row = [];
        foreach (['_id',...$d['key'],...array_keys($d['fields']),'_rev','_v'] as $name) {
            $value = $raw[SqlSchema::column($name)] ?? null;
            $kind = $name === '_v' ? 'json' : ($d['fields'][$name] ?? null);
            if ($kind === 'json' && is_string($value)) {
                $value = json_decode($value, $name === '_v', 64, JSON_THROW_ON_ERROR);
            }
            if ($value !== null && $kind === 'boolean') {
                if (!in_array($value, [true,false,1,0,'1','0','t','f','true','false'], true)) {
                    Schema::invalid();
                } $value = in_array($value, [true,1,'1','t','true'], true);
            }
            if ($value !== null && $kind === 'number') {
                if (!is_numeric($value)) {
                    Schema::invalid();
                } $value = (float)$value;
            }
            if ($name === '_rev' && is_string($value) && ctype_digit($value)) {
                $value = (int)$value;
            }
            $row[$name] = $value;
        }
        Schema::validateRow($entity, $row);
        return $row;
    }
    /**
     * @param list<string> $ids
     * @return array<string,array<string,mixed>> */
    public function get(string $entity, array $ids, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::definition($entity);
        $out = [];
        foreach ($ids as $id) {
            if ($id === '' || strlen($id) > 4096) {
                Schema::invalid();
            }
        }
        try {
            foreach (array_chunk($ids, 900) as $chunk) {
                $cancellation?->throwIfCancelled();
                $rows = $this->driver->run('SELECT * FROM '.$this->table($entity).' WHERE '.$this->q('_id').' IN ('.implode(',', array_fill(0, count($chunk), '?')).')', $chunk)->rows;
                foreach ($rows as $raw) {
                    $row = $this->decode($entity, $raw);
                    if (!in_array($row['_id'], $chunk, true)) {
                        Schema::invalid();
                    } $out[$row['_id']] = $row;
                }
            } return $out;
        } catch (\Throwable $error) {
            self::safe($error);
        }
    }
    /**
     * @param array<string,mixed> $row
     * @return array{list<string>,list<string|int|float|bool|null>} */
    private function cells(string $entity, array $row): array
    {
        $d = Schema::definition($entity);
        $names = ['_id',...$d['key'],...array_keys($d['fields']),'_rev','_v'];
        $values = [];
        foreach ($names as $name) {
            $value = $row[$name] ?? null;
            if ($value !== null && ($name === '_v' || ($d['fields'][$name] ?? null) === 'json')) {
                $value = json_encode($value, JSON_THROW_ON_ERROR | JSON_UNESCAPED_UNICODE);
            } elseif (is_bool($value) && $this->driver->dialect() !== 'postgres') {
                $value = (int)$value;
            } $values[] = $value;
        } return [$names,$values];
    }
    /**
     * @param list<array<string,mixed>> $writes
     * @return array{ok:true}|array{ok:false,conflicts:list<string>} */
    public function commit(array $writes, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        Schema::validateWrites($writes, 1000);
        WriteFence::validate($writes);
        if ($writes === []) {
            return ['ok' => true];
        }
        try {
            $this->mysql(true);
            $this->driver->transaction(function (SqlDriver $tx) use ($writes, $cancellation): void {
                foreach ($writes as $write) {
                    $cancellation?->throwIfCancelled();
                    $table = $this->table($write['entity']);
                    if ($write['kind'] === 'put') {
                        [$names,$values] = $this->cells($write['entity'], $write['row']);
                        $id = $write['row']['_id'];
                        if ($write['expectedRev'] === null) {
                            $sql = 'INSERT INTO '.$table.' ('.implode(',', array_map($this->q(...), $names)).') VALUES ('.implode(',', array_fill(0, count($values), '?')).')';
                        } else {
                            $sql = 'UPDATE '.$table.' SET '.implode(',', array_map(fn (string $name): string => $this->q($name).'=?', $names)).' WHERE '.$this->q('_id').'=? AND '.$this->q('_rev').'=?';
                            $values[] = $id;
                            $values[] = $write['expectedRev'];
                        }
                    } else {
                        $id = $write['id'];
                        $sql = 'DELETE FROM '.$table.' WHERE '.$this->q('_id').'=?';
                        $values = [$id];
                        if (isset($write['expectedRev'])) {
                            $sql .= ' AND '.$this->q('_rev').'=?';
                            $values[] = $write['expectedRev'];
                        }
                    }
                    $affected = $tx->run($sql, $values)->affected;
                    if (($write['kind'] === 'put' || isset($write['expectedRev'])) && $affected !== 1) {
                        throw new SqlConflict($id);
                    }
                }
                $cancellation?->throwIfCancelled();
            });
            return ['ok' => true];
        } catch (SqlConflict $conflict) {
            return ['ok' => false,'conflicts' => [$conflict->identity]];
        } catch (\Throwable $error) {
            if ($this->driver->isConflict($error)) {
                return ['ok' => false,'conflicts' => []];
            } self::safe($error);
        }
    }
    /**
     * @param array<string,mixed> $query
     * @return list<array<string,mixed>> */
    public function query(string $entity, array $query, ?CancellationToken $cancellation = null): array
    {
        $this->check();
        $index = Schema::validateQuery($entity, $query, 100000);
        $params = [];
        $where = [];
        foreach ($index['equals'] as $name) {
            $where[] = $this->q($name).'=?';
            $params[] = $query['equals'][$name];
        }
        foreach ($query['range'] ?? [] as $op => $value) {
            $where[] = $this->q($index['sort']).['gt' => '>','gte' => '>=','lt' => '<','lte' => '<='][$op].'?';
            $params[] = $value;
        }
        if (isset($query['after'])) {
            $op = ($query['order'] ?? 'asc') === 'desc' ? '<' : '>';
            $sort = $this->q($index['sort']);
            $where[] = '('.$sort.$op.'? OR ('.$sort.'=? AND '.$this->q('_id').$op.'?))';
            $params[] = $query['after']['sort'];
            $params[] = $query['after']['sort'];
            $params[] = $query['after']['id'];
        }
        $direction = ($query['order'] ?? 'asc') === 'desc' ? ' DESC' : ' ASC';
        $params[] = $query['limit'];
        try {
            $cancellation?->throwIfCancelled();
            $rows = $this->driver->run('SELECT * FROM '.$this->table($entity).' WHERE '.implode(' AND ', $where).' ORDER BY '.$this->q($index['sort']).$direction.','.$this->q('_id').$direction.' LIMIT ?', $params)->rows;
            return array_map(fn (array $row): array => $this->decode($entity, $row), $rows);
        } catch (\Throwable $error) {
            self::safe($error);
        }
    }
    public function close(): void
    {
        $this->ready = false;
        $this->driver->close();
    }
    /**
     * @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
