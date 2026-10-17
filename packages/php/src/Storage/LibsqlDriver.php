<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Borrowed official turso/libsql Connection. The optional driver requires PHP8.3+FFI.
 * Source verified at 4f6c5669ee844074865a1ea4935d5440ebd28571.
 * Checked execute() handles BEGIN/COMMIT/ROLLBACK; no administrative REST claim.
 */
final class LibsqlDriver implements SqlDriver
{
    /** @var (\Closure(string,list<string|int|float|bool|null>):mixed)|null */ private ?\Closure $execute;
    /** @var (\Closure(string,list<string|int|float|bool|null>):mixed)|null */ private ?\Closure $query;
    private bool $active = false;
    public function __construct(object $connection)
    {
        if (!is_callable([$connection,'execute']) || !is_callable([$connection,'query'])) {
            throw new StorageException('invalid_libsql_connection');
        }
        $this->execute = \Closure::fromCallable([$connection,'execute']);
        $this->query = \Closure::fromCallable([$connection,'query']);
    }
    public function dialect(): string
    {
        return 'sqlite';
    }
    /** @param list<string|int|float|bool|null> $params */
    public function run(string $sql, array $params = []): SqlResult
    {
        if ($this->execute === null || $this->query === null) {
            throw new StorageException('storage_closed');
        }
        $params = array_map(static fn (string|int|float|bool|null $v): string|int|float|null => is_bool($v) ? (int)$v : $v, $params);
        [$sql,$params] = self::parameters($sql, $params);
        if (preg_match('/^\s*(SELECT|WITH|PRAGMA)\b/i', $sql) === 1) {
            $result = ($this->query)($sql, $params);
            if (!is_object($result) || !is_callable([$result,'fetchArray'])) {
                throw new StorageException('invalid_libsql_response');
            }
            $rows = (\Closure::fromCallable([$result,'fetchArray']))();
            if (!is_array($rows) || !array_is_list($rows)) {
                throw new StorageException('invalid_libsql_response');
            }
            foreach ($rows as $row) {
                if (!is_array($row)) {
                    throw new StorageException('invalid_libsql_response');
                }
            }
            /** @var list<array<string,mixed>> $rows */ return new SqlResult($rows);
        }
        $changed = ($this->execute)($sql, $params);
        if (!is_int($changed) || $changed < 0) {
            throw new StorageException('invalid_libsql_response');
        } return new SqlResult(affected:$changed);
    }
    /** Official 4f6c566 CharBox.php:23-26 treats both '' and '0' as null C pointers;
     * Statement::bind then segfaults in libsql_text. Emit only these two fixed
     * SQL string literals, keeping every other value bound. Do not touch quoted
     * question marks or comments. No arbitrary caller value enters SQL text.
     * @param list<string|int|float|null> $params
     * @return array{string,list<string|int|float|null>} */
    private static function parameters(string $sql, array $params): array
    {
        $out = '';
        $bound = [];
        $position = 0;
        $length = strlen($sql);
        for ($i = 0; $i < $length; $i++) {
            $char = $sql[$i];
            if ($char === "'" || $char === '"' || $char === '`') {
                $quote = $char;
                $out .= $char;
                while (++$i < $length) {
                    $out .= $sql[$i];
                    if ($sql[$i] === $quote) {
                        if ($i + 1 < $length && $sql[$i + 1] === $quote) {
                            $out .= $sql[++$i];
                        } else {
                            break;
                        }
                    }
                }
            } elseif (($char === '-' && ($sql[$i + 1] ?? '') === '-') || ($char === '/' && ($sql[$i + 1] ?? '') === '*')) {
                $block = $char === '/';
                $end = strpos($sql, $block ? '*/' : "\n", $i + 2);
                $end = $end === false ? $length : ($block ? $end + 2 : $end + 1);
                $out .= substr($sql, $i, $end - $i);
                $i = $end - 1;
            } elseif ($char === '?') {
                if (!array_key_exists($position, $params) || ctype_digit($sql[$i + 1] ?? '')) {
                    throw new StorageException('invalid_storage_sql_parameters');
                }
                $value = $params[$position++];
                if ($value === '' || $value === '0') {
                    $out .= $value === '' ? "''" : "'0'";
                } else {
                    $out .= '?';
                    $bound[] = $value;
                }
            } else {
                $out .= $char;
            }
        }
        if ($position !== count($params)) {
            throw new StorageException('invalid_storage_sql_parameters');
        }
        return [$out,$bound];
    }
    public function assertIdle(): void
    {
        if ($this->active) {
            throw new StorageException('storage_borrowed_transaction_active');
        }
        // If the caller already has a transaction, BEGIN fails; never roll it back.
        $this->run('BEGIN IMMEDIATE');
        $this->run('ROLLBACK');
    }
    /** @param \Closure(SqlDriver):mixed $body */
    public function transaction(\Closure $body): mixed
    {
        if ($this->active) {
            throw new StorageException('storage_borrowed_transaction_active');
        }
        $this->run('BEGIN IMMEDIATE');
        $this->active = true;
        try {
            $result = $body($this);
            $this->run('COMMIT');
            return $result;
        } catch (\Throwable $error) {
            try {
                $this->run('ROLLBACK');
            } catch (\Throwable) {
            } throw $error;
        } finally {
            $this->active = false;
        }
    }
    public function isConflict(\Throwable $error): bool
    {
        return !$error instanceof StorageException && (str_contains($error->getMessage(), 'UNIQUE constraint failed') || str_contains($error->getMessage(), 'database is locked') || str_contains($error->getMessage(), 'SQLITE_BUSY'));
    }
    public function close(): void
    {
        $this->execute = null;
        $this->query = null;
    }
    /** @return array{redacted:true} */ public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
