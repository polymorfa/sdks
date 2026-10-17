"""Native asyncpg, aiomysql and libsql-client storage with conditional transactions."""

from __future__ import annotations

import json
from collections.abc import AsyncIterator, Mapping, Sequence
from contextlib import AbstractAsyncContextManager, asynccontextmanager
from dataclasses import dataclass
from typing import Any, Literal, Protocol, cast

from ..transport import Json
from .core import (
    ENTITY_NAMES,
    STORAGE_SCHEMA_VERSION,
    CommitResult,
    EntityName,
    IndexQuery,
    RowPut,
    RowWrite,
    StorageCapabilities,
    StoredRow,
    entity_definition,
    index_of,
    validate_commit,
)
from .sqlite import column_name, quote_identifier

Dialect = Literal["postgres", "mysql", "sqlite"]
SqlValue = str | int | float | bool | None


@dataclass(frozen=True)
class SqlResult:
    rows: Sequence[Mapping[str, object]] = ()
    affected: int = 0


class SqlConnection(Protocol):
    async def run(self, statement: str, params: Sequence[SqlValue]) -> SqlResult: ...


class SqlDriver(Protocol):
    dialect: Dialect

    def connection(
        self, *, transaction: bool = False
    ) -> AbstractAsyncContextManager[SqlConnection]: ...
    def is_conflict(self, error: Exception) -> bool: ...
    async def close(self) -> None: ...


class _Conflict(Exception):
    def __init__(self, identity: str) -> None:
        self.identity = identity


def _q(dialect: Dialect, value: str) -> str:
    quoted = quote_identifier(value)
    return "`" + value + "`" if dialect == "mysql" else quoted


def sql_schema_statements(
    dialect: Dialect, *, table_prefix: str = "polymorfa_", schema: str | None = None
) -> list[str]:
    """Explicit schema2 DDL; these statements never migrate an existing version."""
    result: list[str] = []
    if dialect not in ("postgres", "mysql", "sqlite"):
        raise ValueError("Unknown SQL dialect")
    if schema is not None and dialect != "postgres":
        raise ValueError("Only PostgreSQL accepts a schema")

    def q(value: str) -> str:
        return _q(dialect, value)

    def table(value: str) -> str:
        return (q(schema) + "." if schema else "") + q(table_prefix + value)

    if schema:
        result.append("CREATE SCHEMA IF NOT EXISTS " + q(schema))
    kinds = {
        "postgres": {
            "key": "text",
            "id": 'text COLLATE "C"',
            "string": "text",
            "number": "double precision",
            "boolean": "boolean",
            "json": "jsonb",
        },
        "mysql": {
            "key": "varchar(191) CHARACTER SET utf8mb4 COLLATE utf8mb4_bin",
            "id": "varchar(1024) CHARACTER SET ascii COLLATE ascii_bin",
            "string": "mediumtext",
            "number": "double",
            "boolean": "tinyint(1)",
            "json": "json",
        },
        "sqlite": {
            "key": "text",
            "id": "text",
            "string": "text",
            "number": "real",
            "boolean": "integer",
            "json": "text",
        },
    }[dialect]
    for entity in ENTITY_NAMES:
        definition = entity_definition(entity)
        columns = [q("_id") + " " + kinds["id"] + " NOT NULL PRIMARY KEY"]
        columns.extend(
            q(column_name(field)) + " " + kinds["key"] + " NOT NULL" for field in definition["key"]
        )
        for field, kind in definition["fields"].items():
            indexed_string = (
                dialect == "mysql"
                and kind == "string"
                and any(field in index["equals"] for index in definition["indexes"])
            )
            columns.append(q(column_name(field)) + " " + kinds["key" if indexed_string else kind])
        columns.extend(
            (q("_rev") + " bigint NOT NULL", q("_v") + " " + kinds["json"] + " NOT NULL")
        )
        indexes = [
            (index["name"], [*index["equals"], index["sort"], "_id"])
            for index in definition["indexes"]
        ]
        if dialect == "mysql":
            columns.extend(
                "KEY "
                + q(table_prefix + entity + "_" + name)
                + " ("
                + ",".join(q(column_name(field)) for field in fields)
                + ")"
                for name, fields in indexes
            )
            columns.append(
                "UNIQUE KEY "
                + q(table_prefix + entity + "_key")
                + " ("
                + ",".join(q(column_name(field)) for field in definition["key"])
                + ")"
            )
        statement = "CREATE TABLE IF NOT EXISTS " + table(entity) + " (" + ",".join(columns) + ")"
        if dialect == "mysql":
            statement += " ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_bin"
        result.append(statement)
        if dialect != "mysql":
            result.extend(
                "CREATE INDEX IF NOT EXISTS "
                + q(table_prefix + entity + "_" + name)
                + " ON "
                + table(entity)
                + " ("
                + ",".join(q(column_name(field)) for field in fields)
                + ")"
                for name, fields in indexes
            )
    result.append(
        "CREATE TABLE IF NOT EXISTS "
        + table("storage_schema")
        + " ("
        + q("id")
        + " "
        + kinds["key"]
        + " PRIMARY KEY,"
        + q("version")
        + " integer NOT NULL)"
    )
    return result


class SqlAdapter:
    capabilities = StorageCapabilities(True, 1000)

    def __init__(
        self,
        name: str,
        driver: SqlDriver,
        *,
        table_prefix: str = "polymorfa_",
        schema: str | None = None,
        create_tables: bool = True,
    ) -> None:
        self.name, self._driver = name, driver
        self._prefix, self._schema, self._create = table_prefix, schema, create_tables
        sql_schema_statements(driver.dialect, table_prefix=table_prefix, schema=schema)

    def _q(self, name: str) -> str:
        return _q(self._driver.dialect, column_name(name))

    def _table(self, entity: str) -> str:
        return ((_q(self._driver.dialect, self._schema) + ".") if self._schema else "") + _q(
            self._driver.dialect, self._prefix + entity
        )

    def _placeholder(self, position: int) -> str:
        return (
            "$" + str(position)
            if self._driver.dialect == "postgres"
            else "%s"
            if self._driver.dialect == "mysql"
            else "?"
        )

    async def setup(self) -> None:
        async with self._driver.connection(transaction=True) as connection:
            if self._create:
                for statement in sql_schema_statements(
                    self._driver.dialect, table_prefix=self._prefix, schema=self._schema
                ):
                    await connection.run(statement, [])
            rows = (
                await connection.run(
                    "SELECT "
                    + self._q("version")
                    + " FROM "
                    + self._table("storage_schema")
                    + " WHERE "
                    + self._q("id")
                    + "="
                    + self._placeholder(1),
                    ["storage"],
                )
            ).rows
            if rows and rows[0]["version"] != STORAGE_SCHEMA_VERSION:
                raise ValueError("Customer-owned storage requires an explicit schema2 migration")
            if not rows:
                if not self._create:
                    raise ValueError("Customer-owned storage schema2 is not initialized")
                await connection.run(
                    "INSERT INTO "
                    + self._table("storage_schema")
                    + " ("
                    + self._q("id")
                    + ","
                    + self._q("version")
                    + ") VALUES ("
                    + self._placeholder(1)
                    + ","
                    + self._placeholder(2)
                    + ")",
                    ["storage", STORAGE_SCHEMA_VERSION],
                )

    def _decode(self, entity: EntityName, raw: Mapping[str, object]) -> StoredRow:
        definition = entity_definition(entity)
        wire: dict[str, Json] = {}
        for name in ("_id", *definition["key"], *definition["fields"], "_rev", "_v"):
            value = raw[column_name(name)]
            kind = "json" if name == "_v" else definition["fields"].get(name)
            wire[name] = (
                json.loads(value)
                if kind == "json" and isinstance(value, (str, bytes))
                else bool(value)
                if value is not None and kind == "boolean"
                else cast(Json, value)
            )
        return StoredRow.from_wire(entity, wire)

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        entity_definition(entity)
        if any(not isinstance(identity, str) or not identity for identity in ids):
            raise ValueError("Invalid storage row identity")
        result = {}
        async with self._driver.connection() as connection:
            for offset in range(0, len(ids), 900):
                batch = ids[offset : offset + 900]
                rows = await connection.run(
                    "SELECT * FROM "
                    + self._table(entity)
                    + " WHERE "
                    + self._q("_id")
                    + " IN ("
                    + ",".join(self._placeholder(index + 1) for index in range(len(batch)))
                    + ")",
                    batch,
                )
                for raw in rows.rows:
                    row = self._decode(entity, raw)
                    result[row.id] = row
        return result

    def _cells(self, entity: EntityName, row: StoredRow) -> tuple[list[str], list[SqlValue]]:
        definition = entity_definition(entity)
        names = ["_id", *definition["key"], *definition["fields"], "_rev", "_v"]
        wire = row.wire()
        values: list[SqlValue] = []
        for name in names:
            value = wire[name]
            if value is not None and (name == "_v" or definition["fields"].get(name) == "json"):
                values.append(json.dumps(value, separators=(",", ":"), allow_nan=False))
            elif isinstance(value, bool) and self._driver.dialect != "postgres":
                values.append(int(value))
            else:
                values.append(cast(SqlValue, value))
        return names, values

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, self.capabilities.max_commit_size)
        try:
            async with self._driver.connection(transaction=True) as connection:
                for write in writes:
                    identity = write.row.id if isinstance(write, RowPut) else write.id
                    table = self._table(write.entity)
                    if isinstance(write, RowPut):
                        names, values = self._cells(write.entity, write.row)
                        if write.expected_rev is None:
                            sql = (
                                "INSERT INTO "
                                + table
                                + " ("
                                + ",".join(self._q(name) for name in names)
                                + ") VALUES ("
                                + ",".join(
                                    self._placeholder(index + 1) for index in range(len(values))
                                )
                                + ")"
                            )
                        else:
                            sql = (
                                "UPDATE "
                                + table
                                + " SET "
                                + ",".join(
                                    self._q(name) + "=" + self._placeholder(index + 1)
                                    for index, name in enumerate(names)
                                )
                                + " WHERE "
                                + self._q("_id")
                                + "="
                                + self._placeholder(len(values) + 1)
                                + " AND "
                                + self._q("_rev")
                                + "="
                                + self._placeholder(len(values) + 2)
                            )
                            values.extend((identity, write.expected_rev))
                    else:
                        sql = (
                            "DELETE FROM "
                            + table
                            + " WHERE "
                            + self._q("_id")
                            + "="
                            + self._placeholder(1)
                        )
                        values = [identity]
                        if write.expected_rev is not None:
                            sql += " AND " + self._q("_rev") + "=" + self._placeholder(2)
                            values.append(write.expected_rev)
                    result = await connection.run(sql, values)
                    if (
                        isinstance(write, RowPut) or write.expected_rev is not None
                    ) and result.affected != 1:
                        raise _Conflict(identity)
            return CommitResult(True)
        except _Conflict as error:
            return CommitResult(False, (error.identity,))
        except Exception as error:
            if self._driver.is_conflict(error):
                return CommitResult(
                    False,
                    tuple(
                        write.row.id if isinstance(write, RowPut) else write.id for write in writes
                    ),
                )
            raise

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        index = index_of(entity, query)
        params: list[SqlValue] = []

        def p(value: SqlValue) -> str:
            params.append(value)
            return self._placeholder(len(params))

        parts = [self._q(name) + "=" + p(query.equals[name]) for name in index["equals"]]
        for operator, value in (
            (">", query.range.gt),
            (">=", query.range.gte),
            ("<", query.range.lt),
            ("<=", query.range.lte),
        ):
            if value is not None:
                parts.append(self._q(index["sort"]) + operator + p(value))
        if query.after:
            operator = "<" if query.order == "desc" else ">"
            parts.append(
                "("
                + self._q(index["sort"])
                + operator
                + p(query.after.sort)
                + " OR ("
                + self._q(index["sort"])
                + "="
                + p(query.after.sort)
                + " AND "
                + self._q("_id")
                + operator
                + p(query.after.id)
                + "))"
            )
        direction = " DESC" if query.order == "desc" else " ASC"
        sql = (
            "SELECT * FROM "
            + self._table(entity)
            + " WHERE "
            + " AND ".join(parts)
            + " ORDER BY "
            + self._q(index["sort"])
            + direction
            + ","
            + self._q("_id")
            + direction
            + " LIMIT "
            + p(query.limit)
        )
        async with self._driver.connection() as connection:
            result = await connection.run(sql, params)
        return [self._decode(entity, row) for row in result.rows]

    async def close(self) -> None:
        await self._driver.close()


class _PostgresDriver:
    dialect: Dialect = "postgres"

    def __init__(self, pool: object, close_client: bool) -> None:
        self._pool, self._close = cast(Any, pool), close_client

    @asynccontextmanager
    async def connection(self, *, transaction: bool = False) -> AsyncIterator[SqlConnection]:
        async with self._pool.acquire() as native:

            class Connection:
                async def run(self, statement: str, params: Sequence[SqlValue]) -> SqlResult:
                    if statement.lstrip().upper().startswith("SELECT"):
                        return SqlResult(await native.fetch(statement, *params))
                    result = str(await native.execute(statement, *params))
                    count = result.rsplit(" ", 1)[-1]
                    return SqlResult(affected=int(count) if count.isdigit() else 0)

            if transaction:
                async with native.transaction():
                    yield Connection()
            else:
                yield Connection()

    def is_conflict(self, error: Exception) -> bool:
        return getattr(error, "sqlstate", None) in ("23505", "40P01", "40001")

    async def close(self) -> None:
        if self._close:
            await self._pool.close()


class _MysqlDriver:
    dialect: Dialect = "mysql"

    def __init__(self, pool: object, close_client: bool) -> None:
        self._pool, self._close = cast(Any, pool), close_client

    @asynccontextmanager
    async def connection(self, *, transaction: bool = False) -> AsyncIterator[SqlConnection]:
        async with self._pool.acquire() as native:

            class Connection:
                async def run(self, statement: str, params: Sequence[SqlValue]) -> SqlResult:
                    async with native.cursor() as cursor:
                        await cursor.execute(statement, tuple(params))
                        if cursor.description:
                            columns = [item[0] for item in cursor.description]
                            return SqlResult(
                                [
                                    dict(zip(columns, row, strict=True))
                                    for row in await cursor.fetchall()
                                ],
                                cursor.rowcount,
                            )
                        return SqlResult(affected=cursor.rowcount)

            if transaction:
                await native.begin()
            try:
                yield Connection()
                if transaction:
                    await native.commit()
            except BaseException:
                if transaction:
                    await native.rollback()
                raise

    def is_conflict(self, error: Exception) -> bool:
        return bool(error.args and error.args[0] in (1062, 1213, 1205))

    async def close(self) -> None:
        if self._close:
            self._pool.close()
            await self._pool.wait_closed()


class _LibsqlDriver:
    dialect: Dialect = "sqlite"

    def __init__(self, client: object, close_client: bool) -> None:
        self._client, self._close = cast(Any, client), close_client

    @asynccontextmanager
    async def connection(self, *, transaction: bool = False) -> AsyncIterator[SqlConnection]:
        native = self._client.transaction() if transaction else self._client

        class Connection:
            async def run(self, statement: str, params: Sequence[SqlValue]) -> SqlResult:
                result = await native.execute(statement, list(params))
                return SqlResult(
                    [dict(zip(result.columns, row, strict=True)) for row in result.rows],
                    int(result.rows_affected),
                )

        try:
            yield Connection()
            if transaction:
                await native.commit()
        except BaseException:
            if transaction:
                await native.rollback()
            raise
        finally:
            if transaction:
                native.close()

    def is_conflict(self, error: Exception) -> bool:
        return getattr(error, "code", None) in (
            "SQLITE_CONSTRAINT",
            "SQLITE_CONSTRAINT_PRIMARYKEY",
            "SQLITE_BUSY",
            "SQLITE_LOCKED",
        )

    async def close(self) -> None:
        if self._close:
            await self._client.close()


class LibsqlAdapter(SqlAdapter):
    capabilities = StorageCapabilities(True, 500)

    def __init__(
        self,
        client: object,
        *,
        table_prefix: str = "polymorfa_",
        create_tables: bool = True,
        close_client: bool = False,
    ) -> None:
        super().__init__(
            "libsql",
            _LibsqlDriver(client, close_client),
            table_prefix=table_prefix,
            create_tables=create_tables,
        )
        self._client = cast(Any, client)

    async def setup(self) -> None:
        if self._create:
            for statement in sql_schema_statements("sqlite", table_prefix=self._prefix):
                await self._client.execute(statement)
            await self._client.execute(
                "CREATE TABLE IF NOT EXISTS "
                + quote_identifier(self._prefix + "storage_guard")
                + " (x integer NOT NULL)"
            )
            await self._client.execute(
                "INSERT INTO "
                + self._table("storage_schema")
                + " (id,version) VALUES (?,?) ON CONFLICT (id) DO NOTHING",
                ["storage", STORAGE_SCHEMA_VERSION],
            )
        result = await self._client.execute(
            "SELECT version FROM " + self._table("storage_schema") + " WHERE id=?", ["storage"]
        )
        if len(result.rows) != 1 or result.rows[0][0] != STORAGE_SCHEMA_VERSION:
            raise ValueError("Customer-owned storage requires an explicit schema2 migration")

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, 500)
        statements: list[tuple[str, list[SqlValue]]] = []
        guard = (
            "INSERT INTO "
            + quote_identifier(self._prefix + "storage_guard")
            + " (x) SELECT NULL WHERE changes()=0"
        )
        for write in writes:
            table = self._table(write.entity)
            if isinstance(write, RowPut):
                names, values = self._cells(write.entity, write.row)
                if write.expected_rev is None:
                    sql = (
                        "INSERT INTO "
                        + table
                        + " ("
                        + ",".join(self._q(name) for name in names)
                        + ") VALUES ("
                        + ",".join("?" for _ in names)
                        + ")"
                    )
                else:
                    sql = (
                        "UPDATE "
                        + table
                        + " SET "
                        + ",".join(self._q(name) + "=?" for name in names)
                        + " WHERE _id=? AND _rev=?"
                    )
                    values.extend((write.row.id, write.expected_rev))
            else:
                sql = "DELETE FROM " + table + " WHERE _id=?"
                values = [write.id]
                if write.expected_rev is not None:
                    sql += " AND _rev=?"
                    values.append(write.expected_rev)
            statements.append((sql, values))
            if write.expected_rev is not None:
                statements.append((guard, []))
        if not statements:
            return CommitResult(True)
        try:
            # The native HTTP, WebSocket and file clients all provide atomic batches.
            await self._client.batch(statements)
            return CommitResult(True)
        except Exception as error:
            if self._driver.is_conflict(error) or getattr(error, "code", "").startswith(
                "SQLITE_CONSTRAINT"
            ):
                return CommitResult(
                    False,
                    tuple(
                        write.row.id if isinstance(write, RowPut) else write.id for write in writes
                    ),
                )
            raise


def postgres_adapter(
    pool: object,
    *,
    table_prefix: str = "polymorfa_",
    schema: str | None = None,
    create_tables: bool = True,
    close_client: bool = False,
) -> SqlAdapter:
    """Borrow an asyncpg Pool; its JSON/JSONB codecs must accept JSON strings."""
    return SqlAdapter(
        "postgres",
        _PostgresDriver(pool, close_client),
        table_prefix=table_prefix,
        schema=schema,
        create_tables=create_tables,
    )


def mysql_adapter(
    pool: object,
    *,
    table_prefix: str = "polymorfa_",
    create_tables: bool = True,
    close_client: bool = False,
) -> SqlAdapter:
    """Borrow an aiomysql Pool with autocommit=True for standalone reads."""
    return SqlAdapter(
        "mysql",
        _MysqlDriver(pool, close_client),
        table_prefix=table_prefix,
        create_tables=create_tables,
    )


def libsql_adapter(
    client: object,
    *,
    table_prefix: str = "polymorfa_",
    create_tables: bool = True,
    close_client: bool = False,
) -> LibsqlAdapter:
    """Borrow an asynchronous libsql_client Client, using guarded atomic batches."""
    return LibsqlAdapter(
        client,
        table_prefix=table_prefix,
        create_tables=create_tables,
        close_client=close_client,
    )
