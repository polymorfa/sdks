<?php

declare(strict_types=1);

namespace Polymorfa\Storage;

/** Trusted native SQL connection, not an arbitrary HTTP/database administrative API. */
interface SqlDriver
{
    public function dialect(): string;
    public function assertIdle(): void;
    /**
     * @param list<string|int|float|bool|null> $params */
    public function run(string $sql, array $params = []): SqlResult;
    /**
     * @param \Closure(SqlDriver):mixed $body */
    public function transaction(\Closure $body): mixed;
    public function isConflict(\Throwable $error): bool;
    public function close(): void;
}
