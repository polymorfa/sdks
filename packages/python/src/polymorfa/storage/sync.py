"""Commit data, CAS the checkpoint, then acknowledge. Gaps fail closed."""

from __future__ import annotations

import asyncio
import inspect
import time
from collections.abc import AsyncIterable, AsyncIterator, Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import TYPE_CHECKING, Protocol, TypeAlias

from ..transport import Json
from ..webhook_models import DirectHistorySyncPayload
from .history_descriptor import (
    HistoryDescriptorMode,
    validate_chunk,
    validate_descriptor,
    validate_mode,
)

if TYPE_CHECKING:
    from collections.abc import Mapping

    from ..history import HistorySync

from ..events import StreamedEvent, StreamGap
from ..transport import DEFAULT_OPTIONS, RequestOptions
from ..webhooks import WebhookEvent
from .core import Checkpoint, OperationBatch, StorageAdapter
from .engine import ApplyResult, Storage
from .reduce_events import STORED_EVENT_TYPES, reduce_event
from .reduce_history import history_identity_index, reduce_history_chunk
from .reducer_common import record

HistoryDecoder = Callable[[WebhookEvent], Awaitable[object | None]]
HistoryDescriptorDecoder: TypeAlias = Callable[
    [DirectHistorySyncPayload, WebhookEvent], Awaitable["Mapping[str, Json] | HistorySync"]
]


class StorageStreamGapError(Exception):
    pass


class StoragePayloadUnavailableError(Exception):
    pass


def _storage(target: Storage | StorageAdapter) -> Storage:
    return target if isinstance(target, Storage) else Storage(target)


async def apply_event(
    target: Storage | StorageAdapter,
    event: WebhookEvent,
    *,
    decode_history: HistoryDecoder | None = None,
    decode_history_descriptor: HistoryDescriptorDecoder | None = None,
    history_descriptor_mode: HistoryDescriptorMode = "decode",
) -> ApplyResult:
    storage = _storage(target)
    validate_mode(history_descriptor_mode)
    payload = record(event.payload)
    if event.event == "history.sync" and "delivery" in payload:
        descriptor = validate_descriptor(event.payload)
        if await storage.has_event(event.session, event.id):
            return ApplyResult(False, 0)
        batch = reduce_event(event)
        if history_descriptor_mode == "metadata-only":
            return await storage.apply(batch)
        if decode_history_descriptor is None:
            raise ValueError("A history descriptor decoder is required")
        try:
            descriptor_chunk = await decode_history_descriptor(descriptor, event)
            validate_chunk(descriptor_chunk)
            history = reduce_history_chunk(event.session, descriptor_chunk)
        except Exception:  # noqa: BLE001 - caller errors may contain descriptor secrets.
            raise ValueError("Failed to decode history descriptor") from None
        return await storage.apply(
            OperationBatch(
                batch.session_id,
                [*history.operations, *batch.operations],
                batch.event_id,
                batch.event_type,
            )
        )
    batch = reduce_event(event)
    if (
        event.event == "history.sync"
        and payload.get("kind") != "history"
        and decode_history is not None
    ):
        if await storage.has_event(event.session, event.id):
            return ApplyResult(False, 0)
        chunk = await decode_history(event)
        if chunk is not None:
            history = reduce_history_chunk(
                event.session, chunk, identities=history_identity_index(payload)
            )
            batch = OperationBatch(
                batch.session_id,
                [*history.operations, *batch.operations],
                batch.event_id,
                batch.event_type,
            )
    return await storage.apply(batch)


def storage_webhook_handler(
    target: Storage | StorageAdapter,
    *,
    decode_history: HistoryDecoder | None = None,
    decode_history_descriptor: HistoryDescriptorDecoder | None = None,
    history_descriptor_mode: HistoryDescriptorMode = "decode",
) -> Callable[[WebhookEvent], Awaitable[ApplyResult]]:
    storage = _storage(target)

    async def handle(event: WebhookEvent) -> ApplyResult:
        return await apply_event(
            storage,
            event,
            decode_history=decode_history,
            decode_history_descriptor=decode_history_descriptor,
            history_descriptor_mode=history_descriptor_mode,
        )

    return handle


class EventStreamSource(Protocol):
    def stream(
        self,
        *,
        project_id: str | None = None,
        since: str | None = None,
        types: list[str] | None = None,
        manual_ack: bool = False,
        options: RequestOptions = DEFAULT_OPTIONS,
        on_gap: Callable[[StreamGap], None] | None = None,
    ) -> AsyncIterable[StreamedEvent]: ...
    async def acknowledge_stream(
        self,
        stream_id: str,
        cursor: str,
        sequence: int,
        *,
        project_id: str | None = None,
        options: RequestOptions = DEFAULT_OPTIONS,
    ) -> object: ...


@dataclass
class StorageSync:
    done: asyncio.Task[None]
    _stopped: asyncio.Event

    def stop(self) -> None:
        self._stopped.set()
        asyncio.get_running_loop().call_soon(self.done.cancel)

    async def close(self) -> None:
        self.stop()
        await self.done


def sync_to_storage(
    source: EventStreamSource,
    target: Storage | StorageAdapter,
    *,
    project_id: str | None = None,
    checkpoint_session_id: str = "*",
    checkpoint_stream: str = "events",
    event_types: Sequence[str] | None = None,
    require_payload: bool = True,
    decode_history: HistoryDecoder | None = None,
    decode_history_descriptor: HistoryDescriptorDecoder | None = None,
    history_descriptor_mode: HistoryDescriptorMode = "decode",
    on_applied: Callable[[StreamedEvent, ApplyResult], None | Awaitable[None]] | None = None,
    now: Callable[[], float] | None = None,
    options: RequestOptions = DEFAULT_OPTIONS,
) -> StorageSync:
    validate_mode(history_descriptor_mode)
    storage = _storage(target)
    stopped = asyncio.Event()
    clock = now or (lambda: time.time() * 1000)

    def gap(_value: StreamGap) -> None:
        raise StorageStreamGapError(
            "Event retention has a storage gap; reconcile customer-owned history before resuming"
        )

    async def run() -> None:
        stream: AsyncIterable[StreamedEvent] | None = None
        iterator: AsyncIterator[StreamedEvent] | None = None
        try:
            if stopped.is_set():
                return
            saved = await storage.get_checkpoint(checkpoint_session_id, checkpoint_stream)
            expected = saved.cursor if saved is not None else None
            stream = source.stream(
                project_id=project_id,
                since=expected,
                types=list(event_types if event_types is not None else STORED_EVENT_TYPES),
                manual_ack=True,
                options=options,
                on_gap=gap,
            )
            iterator = aiter(stream)
            async for item in iterator:
                if stopped.is_set():
                    break
                if item.webhook is None and require_payload:
                    raise StoragePayloadUnavailableError(
                        "Event body is unavailable; storage checkpoint and acknowledgement were not advanced"
                    )
                result = (
                    await apply_event(
                        storage,
                        item.webhook,
                        decode_history=decode_history,
                        decode_history_descriptor=decode_history_descriptor,
                        history_descriptor_mode=history_descriptor_mode,
                    )
                    if item.webhook is not None
                    else ApplyResult(False, 0)
                )
                await storage.apply(
                    OperationBatch(
                        checkpoint_session_id,
                        [
                            Checkpoint(
                                checkpoint_session_id,
                                checkpoint_stream,
                                item.cursor,
                                expected_cursor=expected,
                                updated_at=clock(),
                            )
                        ],
                    )
                )
                expected = item.cursor
                await source.acknowledge_stream(
                    item.stream_id,
                    item.cursor,
                    item.sequence,
                    project_id=project_id,
                    options=options,
                )
                if on_applied is not None:
                    response = on_applied(item, result)
                    if inspect.isawaitable(response):
                        await response
        except asyncio.CancelledError:
            if not stopped.is_set():
                raise
        finally:
            close = getattr(stream, "close", None)
            if close is not None:
                result = close()
                if inspect.isawaitable(result):
                    await result
            else:
                aclose = getattr(stream, "aclose", None)
                if aclose is not None:
                    await aclose()
            if iterator is not stream:
                aclose = getattr(iterator, "aclose", None)
                if aclose is not None:
                    await aclose()

    return StorageSync(asyncio.create_task(run()), stopped)
