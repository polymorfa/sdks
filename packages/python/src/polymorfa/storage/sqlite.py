"""Native SQLite adapter with schema2 columns interoperable with the TS adapter."""

from __future__ import annotations

import asyncio
import json
import re
import sqlite3
from collections.abc import Callable, Sequence
from pathlib import Path
from typing import TypeVar, cast

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

T = TypeVar("T")


def column_name(value: str) -> str:
    return re.sub(r"[A-Z]", lambda match: "_" + match.group().lower(), value)


def quote_identifier(value: str) -> str:
    if re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", value) is None:
        raise ValueError("Invalid SQL identifier")
    return '"' + value + '"'


def schema_statements(prefix: str = "polymorfa_") -> list[str]:
    result = []
    kinds = {"string": "text", "number": "real", "boolean": "integer", "json": "text"}
    for entity in ENTITY_NAMES:
        definition = entity_definition(entity)
        table = quote_identifier(prefix + entity)
        columns = [
            '"_id" text NOT NULL PRIMARY KEY',
            *[quote_identifier(column_name(name)) + " text NOT NULL" for name in definition["key"]],
            *[
                quote_identifier(column_name(name)) + " " + kinds[kind]
                for name, kind in definition["fields"].items()
            ],
            '"_rev" bigint NOT NULL',
            '"_v" text NOT NULL',
        ]
        result.append(f"CREATE TABLE IF NOT EXISTS {table} ({','.join(columns)})")
        for index in definition["indexes"]:
            name = quote_identifier(prefix + entity + "_" + index["name"])
            fields = ",".join(
                quote_identifier(column_name(field))
                for field in [*index["equals"], index["sort"], "_id"]
            )
            result.append(f"CREATE INDEX IF NOT EXISTS {name} ON {table} ({fields})")
        name = quote_identifier(prefix + entity + "_key")
        fields = ",".join(quote_identifier(column_name(field)) for field in definition["key"])
        result.append(f"CREATE UNIQUE INDEX IF NOT EXISTS {name} ON {table} ({fields})")
    result.append(
        f'CREATE TABLE IF NOT EXISTS {quote_identifier(prefix + "storage_schema")} ("id" text PRIMARY KEY,"version" integer NOT NULL)'
    )
    return result


class SqliteAdapter:
    name = "sqlite"
    capabilities = StorageCapabilities(True, 10000)

    def __init__(
        self,
        database: str | Path | sqlite3.Connection,
        *,
        table_prefix: str = "polymorfa_",
        create_tables: bool = True,
        close_client: bool = False,
    ) -> None:
        quote_identifier(table_prefix + "messages")
        self._prefix, self._create = table_prefix, create_tables
        if isinstance(database, sqlite3.Connection):
            self._db, self._owns, self._threaded = database, close_client, False
        else:
            self._db = sqlite3.connect(str(database), check_same_thread=False, isolation_level=None)
            self._owns, self._threaded = True, True
        self._lock = asyncio.Lock()

    async def _run(self, operation: Callable[[], T]) -> T:
        async with self._lock:
            if not self._threaded:
                return operation()
            # Cancellation waits for the native transaction to settle before another operation.
            running = asyncio.create_task(asyncio.to_thread(operation))
            try:
                return await asyncio.shield(running)
            except asyncio.CancelledError:
                await running
                raise

    def _table(self, entity: EntityName) -> str:
        entity_definition(entity)
        return quote_identifier(self._prefix + entity)

    async def setup(self) -> None:
        def operation() -> None:
            if self._create:
                for statement in schema_statements(self._prefix):
                    self._db.execute(statement)
            meta = quote_identifier(self._prefix + "storage_schema")
            rows = self._db.execute(
                f'SELECT "version" FROM {meta} WHERE "id"=?', ("storage",)
            ).fetchall()
            if rows and rows[0][0] != STORAGE_SCHEMA_VERSION:
                raise ValueError(
                    "Customer-owned storage schema version must equal2; apply its migration explicitly"
                )
            if not rows:
                if not self._create:
                    raise ValueError("Customer-owned storage schema2 is not initialized")
                self._db.execute(
                    f'INSERT INTO {meta} ("id","version") VALUES (?,?)',
                    ("storage", STORAGE_SCHEMA_VERSION),
                )
            self._db.commit()

        await self._run(operation)

    def _decode(
        self, entity: EntityName, columns: Sequence[str], values: Sequence[object]
    ) -> StoredRow:
        raw = dict(zip(columns, values, strict=True))
        definition = entity_definition(entity)
        row: dict[str, Json] = {
            "_id": cast(str, raw["_id"]),
            "_rev": cast(int, raw["_rev"]),
            "_v": json.loads(cast(str, raw["_v"])),
        }
        for field in definition["key"]:
            row[field] = cast(str, raw[column_name(field)])
        for field, kind in definition["fields"].items():
            value = raw[column_name(field)]
            row[field] = (
                None
                if value is None
                else json.loads(cast(str, value))
                if kind == "json"
                else bool(value)
                if kind == "boolean"
                else cast(Json, value)
            )
        return StoredRow.from_wire(entity, row)

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        table = self._table(entity)
        if any(not isinstance(identity, str) or not identity for identity in ids):
            raise ValueError("Invalid storage row identifier")

        def operation() -> dict[str, StoredRow]:
            result = {}
            for offset in range(0, len(ids), 900):
                batch = ids[offset : offset + 900]
                cursor = self._db.execute(
                    f'SELECT * FROM {table} WHERE "_id" IN ({",".join("?" for _ in batch)})',
                    tuple(batch),
                )
                columns = [name[0] for name in cursor.description]
                for values in cursor.fetchall():
                    row = self._decode(entity, columns, values)
                    result[row.id] = row
            return result

        return await self._run(operation)

    def _cells(
        self, entity: EntityName, row: StoredRow
    ) -> tuple[list[str], list[str | int | float | None]]:
        definition = entity_definition(entity)
        names = ["_id", *definition["key"], *definition["fields"], "_rev", "_v"]
        values: list[str | int | float | None] = []
        wire = row.wire()
        for name in names:
            value = wire[name]
            if value is not None and (name == "_v" or definition["fields"].get(name) == "json"):
                values.append(json.dumps(value, separators=(",", ":"), allow_nan=False))
            elif isinstance(value, bool):
                values.append(int(value))
            else:
                values.append(cast(str | int | float | None, value))
        return names, values

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, self.capabilities.max_commit_size)

        def operation() -> CommitResult:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                conflicts = []
                for write in writes:
                    table = self._table(write.entity)
                    identity = write.row.id if isinstance(write, RowPut) else write.id
                    existing = self._db.execute(
                        f'SELECT "_rev" FROM {table} WHERE "_id"=?', (identity,)
                    ).fetchone()
                    if isinstance(write, RowPut) and write.expected_rev is None:
                        conflict = existing is not None
                    else:
                        conflict = write.expected_rev is not None and (
                            existing is None or existing[0] != write.expected_rev
                        )
                    if conflict:
                        conflicts.append(identity)
                if conflicts:
                    self._db.rollback()
                    return CommitResult(False, tuple(conflicts))
                for write in writes:
                    table = self._table(write.entity)
                    if isinstance(write, RowPut):
                        names, values = self._cells(write.entity, write.row)
                        columns = ",".join(quote_identifier(column_name(name)) for name in names)
                        updates = ",".join(
                            quote_identifier(column_name(name))
                            + "=excluded."
                            + quote_identifier(column_name(name))
                            for name in names
                            if name != "_id"
                        )
                        self._db.execute(
                            f'INSERT INTO {table} ({columns}) VALUES ({",".join("?" for _ in names)}) ON CONFLICT ("_id") DO UPDATE SET {updates}',
                            values,
                        )
                    else:
                        self._db.execute(f'DELETE FROM {table} WHERE "_id"=?', (write.id,))
                self._db.commit()
                return CommitResult(True)
            except BaseException:
                self._db.rollback()
                raise

        return await self._run(operation)

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        index = index_of(entity, query)
        table = self._table(entity)

        def q(name: str) -> str:
            return quote_identifier(column_name(name))

        parts = [q(name) + "=?" for name in index["equals"]]
        params: list[str | float | int] = [query.equals[name] for name in index["equals"]]
        for operator, bound in (
            (">", query.range.gt),
            (">=", query.range.gte),
            ("<", query.range.lt),
            ("<=", query.range.lte),
        ):
            if bound is not None:
                parts.append(q(index["sort"]) + operator + "?")
                params.append(bound)
        if query.after is not None:
            operator = "<" if query.order == "desc" else ">"
            parts.append(
                f'({q(index["sort"])}{operator}? OR ({q(index["sort"])}=? AND "_id"{operator}?))'
            )
            params.extend((query.after.sort, query.after.sort, query.after.id))
        direction = "DESC" if query.order == "desc" else "ASC"
        sql = f'SELECT * FROM {table} WHERE {" AND ".join(parts)} ORDER BY {q(index["sort"])} {direction},"_id" {direction} LIMIT ?'
        params.append(query.limit)

        def operation() -> list[StoredRow]:
            cursor = self._db.execute(sql, params)
            columns = [name[0] for name in cursor.description]
            return [self._decode(entity, columns, values) for values in cursor.fetchall()]

        return await self._run(operation)

    async def truncate(self) -> None:
        def operation() -> None:
            self._db.execute("BEGIN IMMEDIATE")
            try:
                for entity in ENTITY_NAMES:
                    self._db.execute("DELETE FROM " + self._table(entity))
                self._db.commit()
            except BaseException:
                self._db.rollback()
                raise

        await self._run(operation)

    async def close(self) -> None:
        if self._owns:
            await self._run(self._db.close)


def sqlite_adapter(
    database: str | Path | sqlite3.Connection,
    *,
    table_prefix: str = "polymorfa_",
    create_tables: bool = True,
    close_client: bool = False,
) -> SqliteAdapter:
    return SqliteAdapter(
        database, table_prefix=table_prefix, create_tables=create_tables, close_client=close_client
    )
