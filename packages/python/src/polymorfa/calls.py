"""Programmatic server call media over the pinned pmfa.calls.v2 protocol."""

from __future__ import annotations

import asyncio
import json
import re
import struct
from collections.abc import Awaitable, Callable, Sequence
from dataclasses import dataclass
from typing import Protocol, cast
from urllib.parse import quote, urlsplit

from typing_extensions import Self

from .errors import (
    AuthorizationError,
    ConfigurationError,
    ConflictError,
    ServerError,
    TimeoutError,
    ValidationError,
)
from .transport import Credential, JsonObject


class Socket(Protocol):
    async def send(self, message: str | bytes) -> None: ...
    async def recv(self) -> str | bytes: ...
    async def close(self) -> None: ...


@dataclass(frozen=True)
class AudioFrame:
    samples: tuple[int, ...]


@dataclass(frozen=True)
class VideoFrame:
    data: bytes
    timestamp_us: int
    keyframe: bool = False
    source: int = 0


def encode_audio_frame(samples: Sequence[int]) -> bytes:
    if any(
        isinstance(v, bool) or not isinstance(v, int) or not -32768 <= v <= 32767 for v in samples
    ):
        raise ValidationError("Audio samples must be signed 16-bit integers.")
    return b"\x01" + struct.pack("<" + "h" * len(samples), *samples)


def encode_video_frame(frame: VideoFrame) -> bytes:
    if (
        not frame.data
        or not isinstance(frame.timestamp_us, int)
        or isinstance(frame.timestamp_us, bool)
        or not isinstance(frame.source, int)
        or isinstance(frame.source, bool)
        or not isinstance(frame.keyframe, bool)
        or not 0 <= frame.timestamp_us <= 2**64 - 1
        or not 0 <= frame.source <= 2**32 - 1
    ):
        raise ValidationError("Invalid video frame.")
    return (
        b"\x02"
        + struct.pack(">BBIQ", 1, int(frame.keyframe), frame.source, frame.timestamp_us)
        + frame.data
    )


def decode_media_frame(data: bytes) -> AudioFrame | VideoFrame | None:
    if not data:
        return None
    if data[0] == 1 and (len(data) - 1) % 2 == 0:
        return AudioFrame(struct.unpack("<" + "h" * ((len(data) - 1) // 2), data[1:]))
    if data[0] == 2 and len(data) > 15:
        codec, flags, source, timestamp = struct.unpack(">BBIQ", data[1:15])
        if codec == 1:
            return VideoFrame(data[15:], timestamp, bool(flags & 1), source)
    return None


async def _connect(url: str, subprotocol: str) -> Socket:
    from websockets.asyncio.client import connect
    from websockets.typing import Subprotocol

    socket = await connect(url, subprotocols=[Subprotocol(subprotocol)], ping_interval=None)
    return cast(Socket, socket)


class MediaSocket:
    def __init__(
        self,
        credential: Credential,
        call_id: str,
        connection_id: str,
        *,
        participant: str | None = None,
        base_url: str = "https://api.polymorfa.com",
        ready_timeout: float = 10,
        heartbeat_interval: float = 5,
        connector: Callable[[str, str], Awaitable[Socket]] = _connect,
    ) -> None:
        parsed = urlsplit(base_url)
        if (
            parsed.scheme not in ("https", "http")
            or not parsed.hostname
            or parsed.username
            or parsed.password
            or parsed.query
            or parsed.fragment
            or parsed.path not in ("", "/")
            or (
                parsed.scheme == "http" and parsed.hostname not in ("127.0.0.1", "localhost", "::1")
            )
        ):
            raise ConfigurationError("base_url")
        if (
            not call_id
            or not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", connection_id)
            or (
                participant is not None
                and (
                    credential.kind == "client_token"
                    or not re.fullmatch(r"[A-Za-z0-9._:@-]{1,128}", participant)
                )
            )
            or ready_timeout <= 0
            or heartbeat_interval < 0
        ):
            raise ConfigurationError("media_socket")
        self._credential, self._participant = credential, participant
        self.connection_id, self._call_id = connection_id, call_id
        self._url = (
            base_url.rstrip("/").replace("https://", "wss://", 1).replace("http://", "ws://", 1)
            + "/voip/calls/"
            + quote(call_id, safe="")
            + "/media"
        )
        self._connector, self._timeout, self._interval = (
            connector,
            ready_timeout,
            heartbeat_interval,
        )
        self._socket: Socket | None = None
        self._beat: asyncio.Task[None] | None = None
        self.sample_rate = 16000
        self.video = False
        self.connected = False
        self._awaiting_pong = False

    async def connect(self) -> None:
        if self.connected:
            return

        async def attach() -> None:
            self._socket = await self._connector(self._url, "pmfa.calls.v2")
            frame = {
                "type": "auth",
                "token": self._credential.value,
                "connectionId": self.connection_id,
            }
            if self._participant is not None:
                frame["participant"] = self._participant
            await self._socket.send(json.dumps(frame))
            while True:
                message = await self._socket.recv()
                if not isinstance(message, str):
                    continue
                try:
                    control = json.loads(message)
                except ValueError:
                    continue
                if not isinstance(control, dict):
                    continue
                if control.get("type") == "error":
                    code = control.get("code")
                    if code == "call_claimed":
                        raise ConflictError("Call claimed by another participant.", code=code)
                    if code in ("unauthorized", "calls_disabled"):
                        raise AuthorizationError("Call media connection refused.", code=code)
                    raise ServerError("Call media connection refused.", code=str(code))
                if control.get("type") == "ready":
                    rate = control.get("sampleRate")
                    if (
                        not isinstance(rate, int)
                        or rate <= 0
                        or not isinstance(control.get("video"), bool)
                    ):
                        raise ServerError(
                            "Invalid call media ready frame.", code="invalid_response"
                        )
                    self.sample_rate, self.video = rate, control["video"]
                    self.connected = True
                    break

        try:
            await asyncio.wait_for(attach(), self._timeout)
        except asyncio.TimeoutError:
            await self.close()
            raise TimeoutError(
                "Call media did not authenticate in time.", code="media_timeout"
            ) from None
        except BaseException:
            await self.close()
            raise
        if self._interval:
            self._beat = asyncio.create_task(self._heartbeat())

    async def _heartbeat(self) -> None:
        while self.connected:
            await asyncio.sleep(self._interval)
            if self._awaiting_pong:
                self.connected = False
                if self._socket:
                    await self._socket.close()
                return
            self._awaiting_pong = True
            await self.send_control({"type": "ping"})

    async def send_control(self, frame: JsonObject) -> None:
        if not self.connected or self._socket is None:
            raise ConfigurationError("connection")
        await self._socket.send(json.dumps(frame))

    async def replace_token(self, credential: Credential) -> None:
        frame: JsonObject = {
            "type": "auth",
            "token": credential.value,
            "connectionId": self.connection_id,
        }
        if self._participant is not None and credential.kind != "client_token":
            frame["participant"] = self._participant
        await self.send_control(frame)

    async def send_audio(self, samples: Sequence[int]) -> None:
        if not self.connected or self._socket is None:
            raise ConfigurationError("connection")
        await self._socket.send(encode_audio_frame(samples))

    async def send_video(self, frame: VideoFrame) -> None:
        if not self.connected or self._socket is None:
            raise ConfigurationError("connection")
        await self._socket.send(encode_video_frame(frame))

    async def receive(self) -> AudioFrame | VideoFrame | JsonObject:
        if self._socket is None:
            raise ConfigurationError("connection")
        while self.connected:
            message = await self._socket.recv()
            if isinstance(message, bytes):
                frame = decode_media_frame(message)
                if frame is not None:
                    return frame
            else:
                try:
                    value = json.loads(message)
                except ValueError:
                    continue
                if isinstance(value, dict):
                    if value.get("type") == "pong":
                        self._awaiting_pong = False
                    return cast(JsonObject, value)
        raise ConfigurationError("connection")

    async def leave(self) -> None:
        await self.send_control({"type": "leave"})
        await self.close()

    async def close(self) -> None:
        self.connected = False
        if self._beat is not None:
            self._beat.cancel()
            try:
                await self._beat
            except asyncio.CancelledError:
                pass
            self._beat = None
        if self._socket is not None:
            await self._socket.close()
            self._socket = None

    async def __aenter__(self) -> Self:
        await self.connect()
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()
