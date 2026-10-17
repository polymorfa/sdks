"""Atomic reference adapter. State lives only for this instance's lifetime."""

from __future__ import annotations

import asyncio
import copy
from collections.abc import Sequence

from .core import (
    ENTITY_NAMES,
    CommitResult,
    EntityName,
    IndexQuery,
    RowPut,
    RowWrite,
    StorageCapabilities,
    StoredRow,
    entity_definition,
    filter_rows,
    validate_commit,
)


class MemoryAdapter:
    name = "memory"
    capabilities = StorageCapabilities(True, 10000)

    def __init__(self) -> None:
        self._tables: dict[EntityName, dict[str, StoredRow]] = {
            entity: {} for entity in ENTITY_NAMES
        }
        self._lock = asyncio.Lock()

    async def setup(self) -> None:
        pass

    async def close(self) -> None:
        pass

    async def get(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        entity_definition(entity)
        async with self._lock:
            return copy.deepcopy(
                {
                    identity: self._tables[entity][identity]
                    for identity in ids
                    if identity in self._tables[entity]
                }
            )

    async def commit(self, writes: Sequence[RowWrite]) -> CommitResult:
        validate_commit(writes, self.capabilities.max_commit_size)
        async with self._lock:
            conflicts = []
            for write in writes:
                identity = write.row.id if isinstance(write, RowPut) else write.id
                current = self._tables[write.entity].get(identity)
                if isinstance(write, RowPut) and write.expected_rev is None:
                    conflict = current is not None
                else:
                    conflict = write.expected_rev is not None and (
                        current is None or current.revision != write.expected_rev
                    )
                if conflict:
                    conflicts.append(identity)
            if conflicts:
                return CommitResult(False, tuple(conflicts))
            for write in writes:
                if isinstance(write, RowPut):
                    self._tables[write.entity][write.row.id] = copy.deepcopy(write.row)
                else:
                    self._tables[write.entity].pop(write.id, None)
            return CommitResult(True)

    async def query(self, entity: EntityName, query: IndexQuery) -> list[StoredRow]:
        async with self._lock:
            return filter_rows(entity, list(self._tables[entity].values()), query)

    async def rows(self, entity: EntityName) -> list[StoredRow]:
        entity_definition(entity)
        async with self._lock:
            return copy.deepcopy(list(self._tables[entity].values()))

    async def truncate(self) -> None:
        async with self._lock:
            for table in self._tables.values():
                table.clear()


def memory_adapter() -> MemoryAdapter:
    return MemoryAdapter()
