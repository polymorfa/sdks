"""Subscribe application stores to verified envelopes carried by event streams."""

from __future__ import annotations

import asyncio
from collections.abc import Awaitable, Callable
from dataclasses import dataclass

from .events import EventStream
from .webhooks import WebhookEvent


@dataclass(frozen=True)
class LiveEventMetadata:
    cursor: str


EventListener = Callable[[tuple[WebhookEvent, ...], LiveEventMetadata], Awaitable[None] | None]


class LiveEventSubscription:
    def __init__(self, stream: EventStream, task: asyncio.Task[None]) -> None:
        self.stream, self.task = stream, task

    def __call__(self) -> None:
        self.stream.close()
        self.task.cancel()

    async def close(self) -> None:
        self()
        await asyncio.gather(self.task, return_exceptions=True)


class LiveEventSource:
    def __init__(self, open_stream: Callable[[str | None], EventStream]) -> None:
        self._open = open_stream

    def subscribe(
        self,
        listener: EventListener,
        *,
        cursor: str | None = None,
        on_error: Callable[[BaseException], None] | None = None,
    ) -> LiveEventSubscription:
        stream = self._open(cursor)

        async def consume() -> None:
            try:
                async for item in stream:
                    if item.webhook is not None:
                        result = listener((item.webhook,), LiveEventMetadata(item.cursor))
                        if result is not None:
                            await result
            except asyncio.CancelledError:
                raise
            except Exception as cause:  # noqa: BLE001 - report stream and application listener errors.
                if on_error is not None:
                    on_error(cause)
            finally:
                stream.close()

        task = asyncio.create_task(consume())

        def settled(task: asyncio.Task[None]) -> None:
            if not task.cancelled():
                task.exception()

        task.add_done_callback(settled)
        return LiveEventSubscription(stream, task)


def event_stream_source(open_stream: Callable[[str | None], EventStream]) -> LiveEventSource:
    return LiveEventSource(open_stream)
