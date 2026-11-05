"""Neutral audio/video tracks over the call's single native media reader."""

from __future__ import annotations

import asyncio
from collections.abc import AsyncIterator, Mapping, Sequence
from dataclasses import dataclass
from types import MappingProxyType
from typing import TYPE_CHECKING, Generic, TypeVar, cast

from .calls import AudioFrame, VideoFrame
from .calls_tokens import CallsError
from .voip_models import CallParticipant

if TYPE_CHECKING:
    from .calls_runtime import Call

Frame = TypeVar("Frame", AudioFrame, VideoFrame)


class _Track(Generic[Frame]):
    def __init__(self, call: Call) -> None:
        self._call = call
        self._listeners: set[asyncio.Queue[Frame | None]] = set()

    def _push(self, frame: Frame) -> bool:
        for queue in self._listeners:
            if queue.full():
                raise CallsError("Track consumer did not keep up.", code="media_queue_full")
            queue.put_nowait(frame)
        return bool(self._listeners)

    def _close(self) -> None:
        for queue in self._listeners:
            if queue.full():
                queue.get_nowait()
            queue.put_nowait(None)

    async def frames(self) -> AsyncIterator[Frame]:
        if self._call.ended:
            return
        queue: asyncio.Queue[Frame | None] = asyncio.Queue(maxsize=256)
        self._listeners.add(queue)
        try:
            while True:
                frame = await queue.get()
                if frame is None:
                    return
                yield frame
        finally:
            self._listeners.discard(queue)


class AudioTrack(_Track[AudioFrame]):
    @property
    def sample_rate(self) -> int:
        return self._call.sample_rate

    async def write(self, samples: Sequence[int]) -> bool:
        if self._call._media is None or not self._call._media.socket.connected:
            return False
        await self._call.send_audio(samples)
        return True


@dataclass(frozen=True)
class CallVideoSource:
    id: int
    label: str
    participant: CallParticipant | None = None
    connection_id: str | None = None
    connection_participant: str | None = None


@dataclass(frozen=True)
class OutgoingVideoFrame:
    data: bytes
    timestamp_us: int
    keyframe: bool = False


class VideoTrack(_Track[VideoFrame]):
    def __init__(self, call: Call) -> None:
        super().__init__(call)
        self.keyframe_requests: asyncio.Queue[None] = asyncio.Queue(maxsize=32)
        self.source_changes: asyncio.Queue[CallVideoSource | int] = asyncio.Queue(maxsize=256)

    @property
    def sources(self) -> Mapping[int, CallVideoSource]:
        result: dict[int, CallVideoSource] = {}
        for source, frame in self._call.video_sources.items():
            participant = frame.get("participant")
            if isinstance(participant, dict) and isinstance(participant.get("id"), str):
                label = participant.get("phoneNumber", participant["id"])
                result[source] = CallVideoSource(
                    source,
                    label if isinstance(label, str) else "",
                    cast(CallParticipant, participant),
                )
            else:
                connection, owner = frame.get("connectionId"), frame.get("connectionParticipant")
                if isinstance(connection, str):
                    result[source] = CallVideoSource(
                        source,
                        owner if isinstance(owner, str) else connection,
                        connection_id=connection,
                        connection_participant=owner if isinstance(owner, str) else None,
                    )
        return MappingProxyType(result)

    async def write(self, frame: OutgoingVideoFrame) -> bool:
        if self._call._media is None or not self._call._media.socket.connected:
            return False
        await self._call.send_video(VideoFrame(frame.data, frame.timestamp_us, frame.keyframe))
        return True
