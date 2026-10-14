"""Per-session durable CAS leases, deterministic merge and fenced batch application."""

from __future__ import annotations

import asyncio
import copy
import time
import uuid
from collections.abc import Callable, Mapping, Sequence
from dataclasses import dataclass, replace
from typing import cast

from ..transport import Json
from .core import (
    Checkpoint,
    ClearChat,
    CommitResult,
    Delete,
    EntityName,
    IndexQuery,
    IndexRange,
    OperationBatch,
    Patch,
    QueryCursor,
    RowDelete,
    RowPut,
    RowWrite,
    StorageAdapter,
    StorageOperation,
    StoredRow,
    Unset,
    Upsert,
    empty_row,
    encode_key,
    finite,
    index_of,
    merge_fields,
)


class StorageConflictError(Exception):
    def __init__(self, ids: Sequence[str]) -> None:
        self.ids = tuple(ids)
        super().__init__(f"Storage writes kept conflicting ({len(ids)} rows)")


class StorageLeaseLostError(Exception):
    pass


class StorageCheckpointConflictError(Exception):
    pass


@dataclass(frozen=True)
class ApplyResult:
    applied: bool
    writes: int


@dataclass(frozen=True)
class QueryPage:
    rows: list[dict[str, Json]]
    next: QueryCursor | None


@dataclass(frozen=True)
class SavedCheckpoint:
    cursor: str
    position: Json
    updated_at: float | None


@dataclass
class _Lease:
    row: StoredRow
    lost: bool = False


class Storage:
    def __init__(
        self,
        adapter: StorageAdapter,
        *,
        max_retries: int = 8,
        clear_page_size: int = 200,
        lease_duration_ms: float = 30000,
        lease_wait_ms: float = 30000,
        now: Callable[[], float] | None = None,
    ) -> None:
        caps = adapter.capabilities
        if (
            not caps.atomic_commit
            or isinstance(caps.max_commit_size, bool)
            or not isinstance(caps.max_commit_size, int)
            or caps.max_commit_size < 2
        ):
            raise ValueError("Storage requires atomic conditional commits and a lease fence")
        if (
            isinstance(max_retries, bool)
            or not isinstance(max_retries, int)
            or not 0 <= max_retries <= 100
            or isinstance(clear_page_size, bool)
            or not isinstance(clear_page_size, int)
            or not 1 <= clear_page_size <= 10000
        ):
            raise ValueError("Invalid storage retry or clear-page bounds")
        if (
            not finite(lease_duration_ms)
            or lease_duration_ms <= 0
            or not finite(lease_wait_ms)
            or lease_wait_ms < 0
        ):
            raise ValueError("Invalid storage lease durations")
        self.adapter = adapter
        self._retries, self._page_size = max_retries, clear_page_size
        self._duration, self._wait = lease_duration_ms, lease_wait_ms
        self._now = now or (lambda: time.time() * 1000)
        self._size = caps.max_commit_size - 1

    async def _acquire(self, session: str) -> _Lease:
        identity = encode_key("leases", {"sessionId": session})
        deadline = time.monotonic() + self._wait / 1000
        owner = str(uuid.uuid4())
        while True:
            existing = (await self.adapter.get("leases", [identity])).get(identity)
            if (
                existing is None
                or not existing.values.get("owner")
                or cast(float, existing.values.get("expiresAt") or 0) <= self._now()
            ):
                base = existing or empty_row("leases", {"sessionId": session})
                row = replace(
                    base,
                    revision=base.revision + 1,
                    values={
                        **base.values,
                        "owner": owner,
                        "expiresAt": self._now() + self._duration,
                    },
                )
                result = await self.adapter.commit(
                    [RowPut("leases", row, existing.revision if existing is not None else None)]
                )
                if result.ok:
                    return _Lease(row)
            if time.monotonic() >= deadline:
                raise StorageLeaseLostError("Storage session lease is held by another writer")
            await asyncio.sleep(0.005)

    async def _fenced_commit(self, lease: _Lease, writes: Sequence[RowWrite]) -> CommitResult:
        if lease.lost or cast(float, lease.row.values.get("expiresAt") or 0) <= self._now():
            raise StorageLeaseLostError("Storage session lease expired")
        row = replace(
            lease.row,
            revision=lease.row.revision + 1,
            values={**lease.row.values, "expiresAt": self._now() + self._duration},
        )
        result = await self.adapter.commit([*writes, RowPut("leases", row, lease.row.revision)])
        if result.ok:
            lease.row = row
        elif lease.row.id in result.conflicts:
            lease.lost = True
            raise StorageLeaseLostError("Storage session lease was replaced")
        return result

    async def _release(self, lease: _Lease) -> None:
        row = replace(
            lease.row,
            revision=lease.row.revision + 1,
            values={**lease.row.values, "owner": None, "expiresAt": 0},
        )
        await self.adapter.commit([RowPut("leases", row, lease.row.revision)])

    async def _read_many(self, entity: EntityName, ids: Sequence[str]) -> dict[str, StoredRow]:
        result = {}
        for offset in range(0, len(ids), 1000):
            result.update(await self.adapter.get(entity, ids[offset : offset + 1000]))
        return result

    async def _plan(self, operations: Sequence[StorageOperation]) -> list[RowWrite]:
        grouped: dict[EntityName, set[str]] = {}
        for op in operations:
            entity, identity = _operation_identity(op)
            grouped.setdefault(entity, set()).add(identity)
        original: dict[tuple[EntityName, str], StoredRow | None] = {}
        for entity, ids in grouped.items():
            rows = await self._read_many(entity, list(ids))
            original.update({(entity, identity): rows.get(identity) for identity in ids})
        stored = dict(original)
        for op in operations:
            slot = _operation_identity(op)
            current = stored[slot]
            if isinstance(op, Delete):
                stored[slot] = None
            elif isinstance(op, Checkpoint):
                if (
                    op.expected_cursor is not Unset.VALUE
                    and (current.values.get("cursor") if current is not None else None)
                    != op.expected_cursor
                ):
                    raise StorageCheckpointConflictError(
                        "Storage checkpoint changed before the cursor could advance"
                    )
                base = current or empty_row(
                    "checkpoints", {"sessionId": op.session_id, "stream": op.stream}
                )
                stored[slot] = replace(
                    base,
                    values={
                        **base.values,
                        "cursor": op.cursor,
                        "position": copy.deepcopy(op.position),
                        "updatedAt": op.updated_at,
                    },
                )
            elif isinstance(op, Upsert):
                if current is None and isinstance(op, Patch):
                    continue
                stored[slot] = merge_fields(
                    op.entity, current or empty_row(op.entity, op.key), op.fields
                )
            else:
                raise TypeError("Clear-chat operations cannot enter row planning")
        writes: list[RowWrite] = []
        for (entity, identity), row in stored.items():
            before = original[(entity, identity)]
            if row is None:
                if before is not None:
                    writes.append(RowDelete(entity, identity, before.revision))
            elif before is None or row.versions != before.versions or row.values != before.values:
                writes.append(
                    RowPut(
                        entity,
                        replace(row, revision=(before.revision if before is not None else 0) + 1),
                        before.revision if before is not None else None,
                    )
                )
        return writes

    async def _apply_rows(
        self, operations: Sequence[StorageOperation], lease: _Lease, extra: Sequence[RowWrite] = ()
    ) -> int:
        total = 0
        group_size = max(self._size, 500)
        groups = [
            operations[offset : offset + group_size]
            for offset in range(0, len(operations), group_size)
        ] or [()]
        for number, group in enumerate(groups):
            additional = extra if number == len(groups) - 1 else ()
            conflicts: list[str] = []
            for attempt in range(self._retries + 1):
                writes = [*await self._plan(group), *additional]
                failures: list[str] = []
                for start in range(0, len(writes), self._size):
                    result = await self._fenced_commit(lease, writes[start : start + self._size])
                    failures.extend(result.conflicts if not result.ok else ())
                    if not result.ok:
                        # A later chunk may contain the event marker; never mark a partial failure.
                        break
                if not failures:
                    total += len(writes)
                    break
                conflicts = failures
                await asyncio.sleep(min(0.2, 0.005 * 2**attempt))
            else:
                raise StorageConflictError(conflicts)
        return total

    async def _clear_chat(self, operation: ClearChat, lease: _Lease) -> int:
        removed = 0
        while True:
            messages = await self.adapter.query(
                "messages",
                IndexQuery(
                    "by_chat",
                    {"sessionId": operation.session_id, "chatId": operation.chat_id},
                    self._page_size,
                    range=IndexRange(lte=operation.up_to),
                ),
            )
            if not messages:
                return removed
            deletes: list[StorageOperation] = []
            for message in messages:
                message_id = cast(str, message.values["messageId"])
                key = {"sessionId": operation.session_id, "messageId": message_id}
                for entity in ("reactions", "receipts", "poll_votes"):
                    while True:
                        children = await self.adapter.query(
                            entity, IndexQuery("by_message", key, 500)
                        )
                        if not children:
                            break
                        for start in range(0, len(children), self._size):
                            result = await self._fenced_commit(
                                lease,
                                [
                                    RowDelete(entity, row.id, row.revision)
                                    for row in children[start : start + self._size]
                                ],
                            )
                            if not result.ok:
                                raise StorageConflictError(result.conflicts)
                        removed += len(children)
                        if len(children) < 500:
                            break
                deletes.extend((Delete("media", key), Delete("messages", key)))
            removed += await self._apply_rows(deletes, lease)

    async def _watermarks(self, operations: Sequence[Upsert]) -> list[Upsert]:
        keys = {
            encode_key("chats", {"sessionId": op.guard.session_id, "chatId": op.guard.chat_id})
            for op in operations
            if op.guard is not None
        }
        chats = await self._read_many("chats", list(keys))
        result = []
        for op in operations:
            guard = op.guard
            if guard is None:
                result.append(op)
                continue
            row = chats.get(
                encode_key("chats", {"sessionId": guard.session_id, "chatId": guard.chat_id})
            )
            marks = [
                cast(float, row.values[name])
                for name in ("clearedAt", "deletedAt")
                if row is not None and finite(row.values.get(name))
            ]
            if not marks or guard.timestamp > max(marks):
                result.append(op)
        return result

    async def apply(self, batch: OperationBatch) -> ApplyResult:
        if not isinstance(batch.session_id, str) or not batch.session_id:
            raise ValueError("A storage session is required")
        for operation in batch.operations:
            session = (
                operation.session_id
                if isinstance(operation, (Checkpoint, ClearChat))
                else operation.key.get("sessionId")
            )
            if (
                session != batch.session_id
                or isinstance(operation, Upsert)
                and operation.guard is not None
                and operation.guard.session_id != batch.session_id
            ):
                raise ValueError("A storage batch cannot write a foreign session")
            if isinstance(operation, (Upsert, Delete)) and operation.entity == "leases":
                raise ValueError("Storage lease rows are owned by the engine")
        lease = await self._acquire(batch.session_id)
        try:
            marker: list[RowWrite] = []
            if batch.event_id is not None:
                key = {"sessionId": batch.session_id, "eventId": batch.event_id}
                identity = encode_key("events", key)
                if identity in await self.adapter.get("events", [identity]):
                    return ApplyResult(False, 0)
                row = empty_row("events", key)
                marker.append(
                    RowPut(
                        "events",
                        replace(row, revision=1, values={**row.values, "type": batch.event_type}),
                        None,
                    )
                )
            plain = [
                op
                for op in batch.operations
                if not isinstance(op, ClearChat)
                and not (isinstance(op, Upsert) and op.guard is not None)
            ]
            guarded = [
                op for op in batch.operations if isinstance(op, Upsert) and op.guard is not None
            ]
            total = await self._apply_rows(plain, lease)
            for clear in batch.operations:
                if isinstance(clear, ClearChat):
                    total += await self._clear_chat(clear, lease)
            total += await self._apply_rows(await self._watermarks(guarded), lease, marker)
            return ApplyResult(True, total)
        finally:
            await self._release(lease)

    async def get(self, entity: EntityName, key: Mapping[str, str]) -> dict[str, Json] | None:
        identity = encode_key(entity, key)
        row = (await self.adapter.get(entity, [identity])).get(identity)
        return copy.deepcopy(row.values) if row is not None else None

    async def query(self, entity: EntityName, query: IndexQuery) -> QueryPage:
        index = index_of(entity, query)
        rows = await self.adapter.query(entity, query)
        last = rows[-1] if rows and len(rows) >= query.limit else None
        return QueryPage(
            [copy.deepcopy(row.values) for row in rows],
            QueryCursor(cast(float, last.values.get(index["sort"], 0) or 0), last.id)
            if last is not None
            else None,
        )

    async def get_checkpoint(self, session_id: str, stream: str) -> SavedCheckpoint | None:
        row = await self.get("checkpoints", {"sessionId": session_id, "stream": stream})
        if row is None or not isinstance(row.get("cursor"), str):
            return None
        return SavedCheckpoint(
            cast(str, row["cursor"]),
            row.get("position"),
            cast(float, row["updatedAt"]) if finite(row.get("updatedAt")) else None,
        )

    async def has_event(self, session_id: str, event_id: str) -> bool:
        return await self.get("events", {"sessionId": session_id, "eventId": event_id}) is not None


def _operation_identity(operation: StorageOperation) -> tuple[EntityName, str]:
    if isinstance(operation, Checkpoint):
        return "checkpoints", encode_key(
            "checkpoints", {"sessionId": operation.session_id, "stream": operation.stream}
        )
    if isinstance(operation, ClearChat):
        raise TypeError("Clear-chat operations cannot enter row planning")
    return operation.entity, encode_key(operation.entity, operation.key)


def create_storage(
    adapter: StorageAdapter,
    *,
    max_retries: int = 8,
    clear_page_size: int = 200,
    lease_duration_ms: float = 30000,
    lease_wait_ms: float = 30000,
    now: Callable[[], float] | None = None,
) -> Storage:
    return Storage(
        adapter,
        max_retries=max_retries,
        clear_page_size=clear_page_size,
        lease_duration_ms=lease_duration_ms,
        lease_wait_ms=lease_wait_ms,
        now=now,
    )
