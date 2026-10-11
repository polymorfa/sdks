"""Ordered media preferences and a background reader for server PCM/H.264 calls."""

from __future__ import annotations

import asyncio
import secrets
from collections.abc import Awaitable, Callable
from typing import cast

from typing_extensions import NotRequired, TypedDict

from .calls import AudioFrame, MediaSocket, VideoFrame
from .calls_tokens import CallsError
from .transport import Json, JsonObject


class MediaState(TypedDict):
    audioMuted: bool
    videoEnabled: bool
    screenSharing: NotRequired[bool]


class MediaStateUpdate(TypedDict, total=False):
    audioMuted: bool
    videoEnabled: bool
    screenSharing: bool


class ManagedMedia:
    """One reader owns the socket; command timeouts are unknown and never replayed."""

    def __init__(
        self,
        socket: MediaSocket,
        on_control: Callable[[JsonObject], Awaitable[None]],
        *,
        command_timeout: float = 5,
    ) -> None:
        self.socket = socket
        self._on_control = on_control
        self._timeout = command_timeout
        self._runner: asyncio.Task[None] | None = None
        self._refresh_task: asyncio.Task[None] | None = None
        self._pending: tuple[str, asyncio.Future[JsonObject]] | None = None
        self._lock = asyncio.Lock()
        self._queued = 0
        self._closed = False
        self.frames: asyncio.Queue[AudioFrame | VideoFrame] = asyncio.Queue(maxsize=256)
        self.failure: asyncio.Future[BaseException] = asyncio.get_running_loop().create_future()

    async def connect(self) -> None:
        await self.socket.connect()
        self._runner = asyncio.create_task(self._receive())

    async def _receive(self) -> None:
        try:
            while self.socket.connected:
                frame = await self.socket.receive()
                if isinstance(frame, (AudioFrame, VideoFrame)):
                    if self.frames.full():
                        raise CallsError("Media consumer did not keep up.", code="media_queue_full")
                    self.frames.put_nowait(frame)
                elif frame.get("type") in ("media_state", "media_error"):
                    if (
                        self._pending is not None
                        and frame.get("requestId") == self._pending[0]
                        and not self._pending[1].done()
                    ):
                        self._pending[1].set_result(frame)
                    await self._on_control(frame)
                else:
                    await self._on_control(frame)
        except asyncio.CancelledError:
            raise
        except Exception as cause:  # noqa: BLE001 - socket errors are delivered to the owner.
            if not self.failure.done():
                self.failure.set_result(cause)
        finally:
            if self._pending is not None and not self._pending[1].done():
                self._pending[1].set_exception(
                    CallsError("Media connection closed.", code="media_control_unavailable")
                )

    async def set_media_state(self, update: MediaStateUpdate) -> MediaStateUpdate:
        if not update or any(
            key not in ("audioMuted", "videoEnabled", "screenSharing")
            or not isinstance(value, bool)
            for key, value in update.items()
        ):
            raise CallsError("Specify boolean media preferences.", code="invalid_media_state")
        if self._closed or self._queued >= 16:
            raise CallsError("Media controls are unavailable.", code="media_control_unavailable")
        requested = cast(dict[str, Json], dict(update))
        self._queued += 1
        try:
            async with self._lock:
                if self._closed:
                    raise CallsError(
                        "Media controls are unavailable.", code="media_control_unavailable"
                    )
                request_id = secrets.token_urlsafe(18)
                future: asyncio.Future[JsonObject] = asyncio.get_running_loop().create_future()
                self._pending = (request_id, future)
                try:
                    await self.socket.send_control(
                        {"type": "media_state", "requestId": request_id, **requested}
                    )
                    reply = await asyncio.wait_for(future, self._timeout)
                except asyncio.TimeoutError:
                    raise CallsError(
                        "Media control was not confirmed.", code="media_control_unknown"
                    ) from None
                finally:
                    self._pending = None
                if reply.get("type") != "media_state":
                    code = reply.get("code")
                    raise CallsError(
                        "Media control was refused.",
                        code=code if isinstance(code, str) else "media_control_unknown",
                    )
                if not all(
                    isinstance(reply.get(key), bool) for key in ("audioMuted", "videoEnabled")
                ) or any(
                    (reply.get(key, False) is True) != value for key, value in requested.items()
                ):
                    raise CallsError(
                        "Media preferences were not confirmed.", code="media_control_failed"
                    )
                result: MediaStateUpdate = {
                    "audioMuted": cast(bool, reply["audioMuted"]),
                    "videoEnabled": cast(bool, reply["videoEnabled"]),
                }
                if reply.get("screenSharing") is True:
                    result["screenSharing"] = True
                return result
        finally:
            self._queued -= 1

    async def close(self, *, leave: bool = False) -> None:
        self._closed = True
        if leave and self.socket.connected:
            await self.socket.send_control({"type": "leave"})
        if self._runner is not None:
            self._runner.cancel()
            await asyncio.gather(self._runner, return_exceptions=True)
            self._runner = None
        if self._refresh_task is not None:
            self._refresh_task.cancel()
            await asyncio.gather(self._refresh_task, return_exceptions=True)
            self._refresh_task = None
        await self.socket.close()
