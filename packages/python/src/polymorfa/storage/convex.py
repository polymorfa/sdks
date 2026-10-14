"""Native Convex Python client for application-installed TypeScript handlers."""

from __future__ import annotations

import asyncio
import re
from collections.abc import Callable, Sequence
from dataclasses import asdict, dataclass
from typing import Any, TypeVar, cast

from ..transport import Json
from .core import (
    CommitResult,
    EntityName,
    IndexQuery,
    RowPut,
    RowWrite,
    StorageCapabilities,
    StoredRow,
    entity_definition,
    filter_rows,
    index_of,
    validate_commit,
)

T = TypeVar("T")


@dataclass(frozen=True)
class ConvexFunctionReferences:
    get: str
    commit: str
    query: str

    def __post_init__(self) -> None:
        if any(
            re.fullmatch(r"[A-Za-z0-9_/]+:[A-Za-z0-9_]+", value) is None
            for value in (self.get, self.commit, self.query)
        ):
            raise ValueError("Application-installed Convex function names are required")


async def _native_call(operation: Callable[[], T]) -> T:
    running = asyncio.create_task(asyncio.to_thread(operation))
    try:
        return await asyncio.shield(running)
    except asyncio.CancelledError:
        await running
        raise


def _writes(writes: Sequence[RowWrite]) -> list[Json]:
    encoded: list[Json] = []
    for write in writes:
        record: dict[str, Json] = {
            "kind": "put" if isinstance(write, RowPut) else "delete",
            "entity": write.entity,
        }
        if isinstance(write, RowPut):
            record.update(row=write.row.wire(), expectedRev=write.expected_rev)
        else:
            record["id"] = write.id
            if write.expected_rev is not None:
                record["expectedRev"] = write.expected_rev
        encoded.append(record)
    return encoded


def _query(query: IndexQuery) -> dict[str, Json]:
    record: dict[str, Json] = {
        "index": query.index,
        "equals": dict(query.equals),
        "limit": query.limit,
        "order": query.order,
    }
    ranges = {key: value for key, value in asdict(query.range).items() if value is not None}
    if ranges:
        record["range"] = cast(dict[str, Json], ranges)
    if query.after:
        record["after"] = {"sort": query.after.sort, "id": query.after.id}
    return record


def _rows(entity: EntityName, raw: object) -> list[StoredRow]:
    if not isinstance(raw, list):
        raise TypeError("Convex returned an invalid row collection")
    result = [StoredRow.from_wire(entity, row) for row in raw]
    if len({row.id for row in result}) != len(result):
        raise ValueError("Convex returned duplicate storage rows")
    return result


class ConvexAdapter:
    name = "convex"
    capabilities = StorageCapabilities(True, 500)

    def __init__(self, client: object, references: ConvexFunctionReferences) -> None:
        self._client, self._references = cast(Any, client), references

    async def setup(self) -> None:
        # Registration/authentication/namespace resolution belong to the installed server handlers.
        pass

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        entity_definition(entity)
        if any(not isinstance(identity, str) or not identity for identity in ids):
            raise ValueError("Invalid storage row identity")
        raw = await _native_call(
            lambda: self._client.query(self._references.get, {"entity": entity, "ids": list(ids)})
        )
        rows = _rows(entity, raw)
        if any(row.id not in ids for row in rows):
            raise ValueError("Convex returned an unrequested storage identity")
        return {row.id: row for row in rows}

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, 500)
        raw = await _native_call(
            lambda: self._client.mutation(self._references.commit, {"writes": _writes(writes)})
        )
        if not isinstance(raw, dict) or not isinstance(raw.get("ok"), bool):
            raise TypeError("Convex returned an invalid conditional commit receipt")
        if raw["ok"]:
            return CommitResult(True)
        identities = {write.row.id if isinstance(write, RowPut) else write.id for write in writes}
        conflicts = raw.get("conflicts")
        if (
            not isinstance(conflicts, list)
            or not conflicts
            or any(
                not isinstance(identity, str) or identity not in identities
                for identity in conflicts
            )
        ):
            raise ValueError("Convex returned an invalid conditional conflict receipt")
        return CommitResult(False, tuple(cast(list[str], conflicts)))

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        index = index_of(entity, query)
        raw = await _native_call(
            lambda: self._client.query(
                self._references.query, {"entity": entity, "query": _query(query)}
            )
        )
        rows = _rows(entity, raw)
        if (
            len(rows) > query.limit
            or filter_rows(entity, rows, query) != rows
            or any(
                any(row.values.get(name) != query.equals[name] for name in index["equals"])
                for row in rows
            )
        ):
            raise ValueError("Convex returned rows outside the requested scope")
        return rows

    async def close(self) -> None:
        pass


def convex_adapter(client: object, references: ConvexFunctionReferences) -> ConvexAdapter:
    return ConvexAdapter(client, references)
