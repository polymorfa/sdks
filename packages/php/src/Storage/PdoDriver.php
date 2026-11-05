<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Borrowed native PDO connection. Closing releases this reference, not the caller's. */
final class PdoDriver implements SqlDriver
{
    private ?\PDO $pdo;
    private readonly string $kind;
    public function __construct(\PDO $pdo)
    {
        $this->kind = match($pdo->getAttribute(\PDO::ATTR_DRIVER_NAME)) {
            'pgsql' => 'postgres', 'mysql' => 'mysql', 'sqlite' => 'sqlite', default => throw new StorageException('unsupported_storage_sql_driver')
        };
        if ($pdo->getAttribute(\PDO::ATTR_ERRMODE) !== \PDO::ERRMODE_EXCEPTION) {
            throw new StorageException('storage_pdo_exception_mode_required');
        }
        $this->pdo = $pdo;
    }
    public function dialect(): string
    {
        return $this->kind;
    }
    private function native(): \PDO
    {
        return $this->pdo ?? throw new StorageException('storage_closed');
    }
    public function assertIdle(): void
    {
        if ($this->native()->inTransaction()) {
            throw new StorageException('storage_borrowed_transaction_active');
        }
    }
    /**
     * @param list<string|int|float|bool|null> $params */
    public function run(string $sql, array $params = []): SqlResult
    {
        $statement = $this->native()->prepare($sql);
        if ($statement === false) {
            throw new StorageException('storage_sql_failed');
        }
        try {
            foreach ($params as $i => $value) {
                $type = match(true) {
                    $value === null => \PDO::PARAM_NULL, is_bool($value) => \PDO::PARAM_BOOL, is_int($value) => \PDO::PARAM_INT, default => \PDO::PARAM_STR
                };
                $statement->bindValue($i + 1, is_float($value) ? Rows::canonical($value) : $value, $type);
            }
            if (!$statement->execute()) {
                throw new StorageException('storage_sql_failed');
            }
            /**
     * @var list<array<string,mixed>> $rows */
            $rows = $statement->columnCount() > 0 ? $statement->fetchAll(\PDO::FETCH_ASSOC) : [];
            return new SqlResult($rows, $statement->rowCount());
        } finally {
            $statement->closeCursor();
        }
    }
    /**
     * @param \Closure(SqlDriver):mixed $body */
    public function transaction(\Closure $body): mixed
    {
        $pdo = $this->native();
        $this->assertIdle();
        if (!$pdo->beginTransaction()) {
            throw new StorageException('storage_transaction_failed');
        }
        try {
            $result = $body($this);
            if (!$pdo->commit()) {
                throw new StorageException('storage_transaction_failed');
            } return $result;
        } catch (\Throwable $error) {
            if ($pdo->inTransaction()) {
                $pdo->rollBack();
            } throw $error;
        }
    }
    public function isConflict(\Throwable $error): bool
    {
        if (!$error instanceof \PDOException) {
            return false;
        }
        $state = (string)$error->getCode();
        $native = $error->errorInfo[1] ?? null;
        return in_array($state, ['23505','40001','40P01'], true) || ($this->kind === 'mysql' && in_array($native, [1062,1205,1213], true)) || ($this->kind === 'sqlite' && in_array($native, [5,6,19], true));
    }
    public function close(): void
    {
        $this->pdo = null;
    }
    /**
     * @return array{redacted:true} */
    public function __debugInfo(): array
    {
        return ['redacted' => true];
    }
}
