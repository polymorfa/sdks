"""High-level server calls composed from typed REST operations and native sockets."""

from __future__ import annotations

import asyncio
import secrets
import time
import uuid
from collections import OrderedDict
from collections.abc import AsyncIterator, Callable, Sequence
from dataclasses import dataclass
from typing import Literal, cast

from typing_extensions import Self

from .calls import AudioFrame, MediaSocket, VideoFrame
from .calls_diagnostics import CallReporter
from .calls_lifecycle import LifecycleEvent, LifecycleSocket, close_code
from .calls_media import ManagedMedia, MediaStateUpdate
from .calls_tokens import CallsError, CallsTokenSource, TokenProvider
from .client import AsyncMessagingClient
from .errors import AuthenticationError, ConfigurationError, ConflictError
from .models import CallAcceptance, CallPlacement
from .transport import SDK_VERSION, Credential, JsonObject, RequestOptions
from .voip_models import CallParticipant, CallReaction, CallReport, HandRaised

CallState = Literal["incoming", "ringing", "connecting", "connected", "reconnecting", "ended"]
CallDirection = Literal["inbound", "outbound"]
ReactionEmoji = Literal["", "👍", "❤️", "😂", "😮", "😢", "🙏"]


def _credential(value: str) -> Credential:
    return Credential(
        "client_token"
        if value.startswith("pmfa_ct_")
        else "project_token"
        if value.startswith("pmfa_pt_")
        else "organization_api_key",
        value,
    )


@dataclass(frozen=True)
class CallClaim:
    answered: bool
    answered_by: str | None
    exclusive: bool
    claimed_by_other: bool
    can_join: bool


@dataclass(frozen=True)
class CallCapabilities:
    video: bool = True
    invite: bool = True


class Call:
    def __init__(
        self,
        client: CallsClient,
        call_id: str,
        direction: CallDirection,
        peer: str,
        video: bool,
        *,
        exclusive: bool = False,
    ) -> None:
        self._client = client
        self.id, self.direction, self.peer = call_id, direction, peer
        self.session, self.connection_id = client.session, secrets.token_urlsafe(18)
        self.state: CallState = "incoming" if direction == "inbound" else "ringing"
        self.end_reason: str | None = None
        self.capabilities = CallCapabilities()
        self._offered_video = video
        self._accepted = direction == "outbound"
        self._answered = False
        self._answered_by: str | None = None
        self._exclusive, self._claimed_by_us, self._claimed_by_other = exclusive, exclusive, False
        self._accepting: asyncio.Task[None] | None = None
        self._media: ManagedMedia | None = None
        self._media_runner: asyncio.Task[None] | None = None
        self._preferences: MediaStateUpdate = {}
        self._reconnects = 0
        self._participants: dict[str, CallParticipant] = {}
        self._roster_revision = 0
        self._participant_revisions: dict[str, int] = {}
        self._departed: set[str] = set()
        self.remote_audio_muted: bool | None = None
        self.hand_raised, self.social_supported = False, False
        self.video_sources: dict[int, JsonObject] = {}
        self.controls: asyncio.Queue[JsonObject] = asyncio.Queue(maxsize=256)
        self.states: asyncio.Queue[CallState] = asyncio.Queue(maxsize=64)
        self._connected_event = asyncio.Event()
        self._ended_event = asyncio.Event()
        self.started_at = time.time()
        self.connected_at: float | None = None
        self.ended_at: float | None = None
        self._media_attached = False
        self._reporter = (
            CallReporter(
                self.connection_id,
                {"sdk": "polymorfa-sdk", "version": SDK_VERSION, "platform": "other"},
                self._send_report,
            )
            if client.diagnostics
            else None
        )

    async def _send_report(self, report: CallReport) -> object:
        async with self._client._rest() as client:
            self._client._add_participant(report, client)
            return await client.voip.report(
                self.id, report, options=RequestOptions(timeout=5, max_network_retries=0)
            )

    @property
    def ended(self) -> bool:
        return self.state == "ended"

    @property
    def has_video(self) -> bool:
        return self._offered_video and self.capabilities.video

    @property
    def duration(self) -> int:
        return (
            0
            if self.connected_at is None
            else max(0, int((self.ended_at or time.time()) - self.connected_at))
        )

    @property
    def sample_rate(self) -> int:
        return self._media.socket.sample_rate if self._media is not None else 16000

    @property
    def claim(self) -> CallClaim:
        return CallClaim(
            self._answered,
            self._answered_by,
            self._exclusive,
            self._claimed_by_other,
            self._answered
            and not self._exclusive
            and self.state == "incoming"
            and not self._claimed_by_other,
        )

    @property
    def participants(self) -> tuple[CallParticipant, ...]:
        return tuple(cast(CallParticipant, dict(value)) for value in self._participants.values())

    def _state(self, state: CallState) -> None:
        if self.state == state:
            return
        self.state = state
        if self.states.full():
            self.states.get_nowait()
        self.states.put_nowait(state)
        if state == "connected":
            if self.connected_at is None:
                self.connected_at = time.time()
            self._connected_event.set()

    async def wait_connected(self) -> None:
        ready = asyncio.create_task(self._connected_event.wait())
        ended = asyncio.create_task(self._ended_event.wait())
        try:
            await asyncio.wait((ready, ended), return_when=asyncio.FIRST_COMPLETED)
            if self.ended:
                raise CallsError("Call ended before media connected.", code="call_ended")
        finally:
            ready.cancel()
            ended.cancel()
            await asyncio.gather(ready, ended, return_exceptions=True)

    async def wait_ended(self) -> str:
        await self._ended_event.wait()
        return self.end_reason or "unknown"

    async def answer(self, *, exclusive: bool = False, video: bool | None = None) -> None:
        if self._accepting is not None:
            await asyncio.shield(self._accepting)
            return
        if self.state != "incoming":
            raise CallsError("Call cannot be answered in this state.", code="invalid_state")
        if self._claimed_by_other:
            raise ConflictError("Call claimed by another participant.", code="call_claimed")
        if self.ended:
            raise CallsError("Call has ended.", code="call_ended")
        if self._accepting is None:
            self._accepting = asyncio.create_task(
                self._answer(exclusive, self.has_video if video is None else video)
            )
        try:
            await asyncio.shield(self._accepting)
        finally:
            if self._accepting.done():
                self._accepting = None

    async def join(self, *, video: bool | None = None) -> None:
        if not self._answered and self.state == "incoming":
            raise CallsError("Nobody has answered this call yet.", code="call_not_answered")
        await self.answer(video=video)

    async def _answer(self, exclusive: bool, video: bool) -> None:
        self._state("connecting")
        try:
            async with self._client._rest() as client:
                body: CallAcceptance = {"exclusive": exclusive, "video": video}
                self._client._add_participant(body, client)
                response = await client.voip.accept(
                    self.id, body, options=RequestOptions(max_network_retries=0)
                )
                reply = response.data.get("data")
        except Exception as cause:
            if isinstance(cause, ConflictError) and cause.code == "call_claimed":
                self._claimed_by_other = True
                self._answered = self._exclusive = True
            if not self.ended:
                self._state("incoming")
            raise
        if (
            not isinstance(reply, dict)
            or not isinstance(reply.get("answered"), bool)
            or not isinstance(reply.get("answeredBy"), str)
            or not isinstance(reply.get("exclusive"), bool)
        ):
            self._state("incoming")
            raise CallsError(
                "Invalid call acceptance response.",
                code="malformed_response",
                metadata=response.metadata,
            )
        if self.ended:
            return
        self._accepted = True
        self._answered, self._answered_by, self._exclusive = (
            reply["answered"],
            reply["answeredBy"],
            reply["exclusive"],
        )
        self._claimed_by_us = reply["exclusive"]
        self._state("connecting")
        try:
            await self._attach()
        except Exception as cause:
            await self._release(cause)
            await self._finish(
                "claimed" if isinstance(cause, ConflictError) else "connection_failed"
            )
            raise

    async def _attach(self, *, refresh: bool = False) -> None:
        token = await self._client.tokens.get(refresh=refresh)
        credential = _credential(token.value)
        socket = MediaSocket(
            credential,
            self.id,
            self.connection_id,
            participant=None if credential.kind == "client_token" else self._client.participant,
            base_url=self._client.base_url,
            heartbeat_interval=self._client.media_heartbeat_interval,
            ready_timeout=self._client.connect_timeout,
        )
        media = ManagedMedia(socket, self._control)
        self._media = media
        try:
            await media.connect()
            if token.expires_at is not None:

                async def refresh_token() -> None:
                    current = token
                    while (
                        not self.ended and media.socket.connected and current.expires_at is not None
                    ):
                        remaining = current.expires_at - time.time()
                        await asyncio.sleep(
                            max(1, remaining - 60 if remaining > 120 else remaining / 2)
                        )
                        try:
                            current = await self._client.tokens.get(refresh=True)
                            await media.socket.replace_token(_credential(current.value))
                        except Exception as cause:  # noqa: BLE001 - token providers and connectors are customer supplied.
                            if not media.failure.done():
                                media.failure.set_result(cause)
                            return

                media._refresh_task = asyncio.create_task(refresh_token())
            if self._preferences:
                await media.set_media_state(self._preferences)
            if self.ended:
                await media.close()
                return
            self.remote_audio_muted = None
            self._media_attached = True
            self._state("connected")
            if self._media_runner is None or self._media_runner.done():
                self._media_runner = asyncio.create_task(self._monitor_media())
        except BaseException:
            await media.close()
            if self._media is media:
                self._media = None
            raise

    async def _monitor_media(self) -> None:
        while not self.ended and self._media is not None:
            media = self._media
            cause = await media.failure
            if self.ended or self._media is not media:
                return
            await media.close()
            self._media = None
            self.video_sources.clear()
            code = close_code(cause)
            if code in (1000, 4409, 4400, 4403, 1008, 1009):
                reason = getattr(getattr(cause, "rcvd", None), "reason", "")
                await self._finish(
                    "claimed"
                    if str(reason).lower() == "call claimed"
                    else "remote_hangup"
                    if code in (1000, 4409)
                    else "connection_failed"
                )
                return
            refresh = code == 4401
            self._state("reconnecting")
            for attempt in range(self._client.reconnect_attempts):
                await asyncio.sleep(min(8, self._client.media_backoff * 2**attempt))
                if self.ended:
                    return
                try:
                    await self._attach(refresh=refresh)
                    self._reconnects += 1
                    break
                except ConflictError:
                    await self._finish("claimed")
                    return
                except Exception as retry_cause:  # noqa: BLE001 - socket implementations vary.
                    cause = retry_cause
                    if isinstance(retry_cause, AuthenticationError):
                        refresh = True
            else:
                if self._reporter is not None:
                    self._reporter.error(
                        "token_refresh_failed" if refresh else "reconnect_exhausted"
                    )
                await self._release(cause)
                await self._finish("connection_failed")
                return

    async def _control(self, frame: JsonObject) -> None:
        kind = frame.get("type")
        if kind == "remote_media" and (
            frame.get("audioMuted") is None or isinstance(frame.get("audioMuted"), bool)
        ):
            self.remote_audio_muted = cast(bool | None, frame.get("audioMuted"))
        elif (
            kind == "hand_state"
            and isinstance(frame.get("raised"), bool)
            and isinstance(frame.get("supported"), bool)
        ):
            self.hand_raised, self.social_supported = (
                cast(bool, frame["raised"]),
                cast(bool, frame["supported"]),
            )
        elif kind == "participant_left" and isinstance(frame.get("participantId"), str):
            self._update_participant(cast(str, frame["participantId"]), None)
        elif kind in ("participant_joined", "participant_state"):
            participant = frame.get("participant")
            if _is_participant(participant):
                self._update_participant(
                    cast(CallParticipant, participant)["id"], cast(CallParticipant, participant)
                )
        elif kind == "video_source" and isinstance(frame.get("source"), int):
            self.video_sources[cast(int, frame["source"])] = frame
        elif kind == "video_source_removed" and isinstance(frame.get("source"), int):
            self.video_sources.pop(cast(int, frame["source"]), None)
        elif kind in ("ended", "left"):
            await self._finish("remote_hangup" if kind == "ended" else "left")
        if self.controls.full():
            self.controls.get_nowait()
        self.controls.put_nowait(frame)

    def _update_participant(self, participant_id: str, participant: CallParticipant | None) -> None:
        self._roster_revision += 1
        self._participant_revisions[participant_id] = self._roster_revision
        if participant is None or participant["state"] == "left":
            self._participants.pop(participant_id, None)
            self._departed.add(participant_id)
        else:
            self._participants[participant_id] = participant
            self._departed.discard(participant_id)

    async def set_media_state(self, update: MediaStateUpdate) -> MediaStateUpdate:
        if self._media is None:
            raise CallsError("No media connection is attached.", code="media_control_unavailable")
        self._preferences = await self._media.set_media_state(update)
        return self._preferences

    async def receive_media(self) -> AudioFrame | VideoFrame:
        if self._media is None:
            raise CallsError("No media connection is attached.", code="media_closed")
        media = self._media
        received = asyncio.create_task(media.frames.get())
        try:
            await asyncio.wait((received, media.failure), return_when=asyncio.FIRST_COMPLETED)
            if received.done():
                return received.result()
            raise CallsError("Media connection closed.", code="media_closed")
        finally:
            received.cancel()

    async def send_audio(self, samples: Sequence[int]) -> None:
        if self._media is None:
            raise CallsError("No media connection is attached.", code="media_closed")
        await self._media.socket.send_audio(samples)

    async def send_video(self, frame: VideoFrame) -> None:
        if self._media is None:
            raise CallsError("No media connection is attached.", code="media_closed")
        await self._media.socket.send_video(frame)

    async def add_participant(self, to: str) -> CallParticipant:
        if self.ended:
            raise CallsError("Call has ended.", code="invalid_state")
        revision = self._roster_revision
        async with self._client._rest() as client:
            participant = (
                await client.voip.add_participant(
                    self.id, to, options=RequestOptions(max_network_retries=0)
                )
            ).data["data"]
        if not self.ended and self._participant_revisions.get(participant["id"], 0) <= revision:
            self._update_participant(participant["id"], participant)
        return participant

    async def ring_participant(self, to: str) -> None:
        if self.ended:
            raise CallsError("Call has ended.", code="invalid_state")
        async with self._client._rest() as client:
            await client.voip.ring_participant(
                self.id, to, options=RequestOptions(max_network_retries=0)
            )

    async def send_reaction(self, emoji: ReactionEmoji) -> None:
        if self.state != "connected" or not self.social_supported:
            raise CallsError("Call reactions are unavailable.", code="invalid_state")
        async with self._client._rest() as client:
            body: CallReaction = {"connectionId": self.connection_id, "emoji": emoji}
            self._client._add_participant(body, client)
            await client.voip.send_reaction(
                self.id, body, options=RequestOptions(max_network_retries=0)
            )

    async def set_hand_raised(self, raised: bool) -> None:
        if self.state != "connected" or not self.social_supported:
            raise CallsError("Hand controls are unavailable.", code="invalid_state")
        async with self._client._rest() as client:
            body: HandRaised = {"connectionId": self.connection_id, "raised": raised}
            self._client._add_participant(body, client)
            await client.voip.set_hand_raised(
                self.id, body, options=RequestOptions(max_network_retries=0)
            )

    async def reject(self) -> None:
        if self.ended:
            return
        if self._claimed_by_other:
            await self._finish("claimed")
            return
        async with self._client._rest() as client:
            await client.voip.reject(
                self.id,
                participant=self._client._rest_participant(client),
                options=RequestOptions(max_network_retries=0),
            )
        await self._finish("rejected")

    async def leave(self) -> None:
        if self.ended:
            return
        if self._accepting is not None:
            await asyncio.gather(self._accepting, return_exceptions=True)
        if self._accepted:
            if self._media is not None and self._media.socket.connected:
                await self._media.close(leave=True)
            else:
                async with self._client._rest() as client:
                    await client.voip.leave(
                        self.id,
                        self.connection_id,
                        participant=self._client._rest_participant(client),
                        options=RequestOptions(max_network_retries=0),
                    )
        await self._finish("left")

    async def end(self) -> None:
        if self.ended:
            return
        async with self._client._rest() as client:
            await client.voip.end(
                self.id,
                options=RequestOptions(
                    idempotency_key="voip-end:" + self.id, max_network_retries=0
                ),
            )
        await self._finish("hangup")

    async def _release(self, cause: BaseException | None = None) -> None:
        if not self._accepted or self.ended or isinstance(cause, ConflictError):
            return
        try:

            async def request() -> None:
                if self._claimed_by_us:
                    async with self._client._rest() as client:
                        await client.voip.end(
                            self.id,
                            options=RequestOptions(
                                timeout=5,
                                max_network_retries=0,
                                idempotency_key="voip-end:" + self.id,
                            ),
                        )
                else:
                    async with self._client._rest() as client:
                        await client.voip.leave(
                            self.id,
                            self.connection_id,
                            participant=self._client._rest_participant(client),
                            options=RequestOptions(timeout=5, max_network_retries=0),
                        )

            await asyncio.wait_for(request(), 5)
        except Exception:  # noqa: BLE001 - bounded best-effort release preserves the media failure.
            return

    async def _finish(self, reason: str) -> None:
        if self.ended:
            return
        self.end_reason = reason
        self.ended_at = time.time()
        self._state("ended")
        self._ended_event.set()
        if self._media_runner is not None and self._media_runner is not asyncio.current_task():
            self._media_runner.cancel()
            await asyncio.gather(self._media_runner, return_exceptions=True)
        if self._media is not None:
            media, self._media = self._media, None
            if media._runner is asyncio.current_task():
                await media.socket.close()
            else:
                await media.close()
        if self._reporter is not None:
            if self._media_attached:
                self._reporter.quality({"reconnects": self._reconnects})
            self._reporter.stop()
        self._client._ended(self)


def _is_participant(value: object) -> bool:
    return (
        isinstance(value, dict)
        and isinstance(value.get("id"), str)
        and isinstance(value.get("audioMuted"), bool)
        and isinstance(value.get("video"), bool)
        and value.get("state") in ("invited", "ringing", "connected", "left")
    )


class _RestContext:
    def __init__(self, owner: CallsClient) -> None:
        self.owner = owner
        self.client: AsyncMessagingClient | None = None

    async def __aenter__(self) -> AsyncMessagingClient:
        token = await self.owner.tokens.get()
        self.client = AsyncMessagingClient(
            _credential(token.value), base_url=self.owner.base_url, max_network_retries=0
        )
        return self.client

    async def __aexit__(self, kind: object, cause: object, traceback: object) -> None:
        if isinstance(cause, AuthenticationError):
            self.owner.tokens.invalidate()
        assert self.client is not None
        await self.client.close()


class CallsClient:
    def __init__(
        self,
        token: str | TokenProvider,
        session: str,
        *,
        participant: str | None = None,
        base_url: str = "https://api.polymorfa.com",
        reconnect_attempts: int = 3,
        connect_timeout: float = 10,
        lifecycle_heartbeat_interval: float = 15,
        media_heartbeat_interval: float = 5,
        min_backoff: float = 1,
        max_backoff: float = 30,
        media_backoff: float = 1,
        create_idempotency_key: Callable[[], str] = lambda: str(uuid.uuid4()),
        diagnostics: bool = True,
    ) -> None:
        if not session.strip() or isinstance(reconnect_attempts, bool) or reconnect_attempts < 0:
            raise ConfigurationError("calls_client")
        self.tokens = CallsTokenSource(token)
        self.session, self.participant, self.base_url = session, participant, base_url
        self.reconnect_attempts, self.connect_timeout = reconnect_attempts, connect_timeout
        self.media_heartbeat_interval, self.media_backoff = media_heartbeat_interval, media_backoff
        self._create_key = create_idempotency_key
        self.diagnostics = diagnostics
        self.lifecycle = LifecycleSocket(
            self.tokens,
            session=session,
            participant=participant,
            base_url=base_url,
            connect_timeout=connect_timeout,
            heartbeat_interval=lifecycle_heartbeat_interval,
            min_backoff=min_backoff,
            max_backoff=max_backoff,
            on_event=self._receive,
        )
        self._calls: dict[str, Call] = {}
        self._pending: OrderedDict[str, list[LifecycleEvent]] = OrderedDict()
        self._ended_ids: list[str] = []
        self._generation = 0
        self.incoming: asyncio.Queue[Call] = asyncio.Queue(maxsize=200)
        self._tasks: set[asyncio.Task[None]] = set()

    @property
    def connected(self) -> bool:
        return self.lifecycle.connected

    @property
    def calls(self) -> tuple[Call, ...]:
        return tuple(call for call in self._calls.values() if not call.ended)

    @property
    def participant_reference(self) -> str | None:
        return self.lifecycle.participant

    def get_call(self, call_id: str) -> Call | None:
        return self._calls.get(call_id)

    def _rest(self) -> _RestContext:
        return _RestContext(self)

    def _rest_participant(self, client: AsyncMessagingClient) -> str | None:
        credential = client._transport._credential
        return (
            None
            if credential is not None and credential.kind == "client_token"
            else self.participant
        )

    def _add_participant(self, body: object, client: AsyncMessagingClient) -> None:
        participant = self._rest_participant(client)
        if participant is not None:
            cast(dict[str, object], body)["participant"] = participant

    async def connect(self) -> None:
        await self.lifecycle.connect()

    async def disconnect(self) -> None:
        self._generation += 1
        await self.lifecycle.close()
        await asyncio.gather(
            *(
                call.end()
                if call.direction == "outbound" and call.state == "ringing"
                else call.leave()
                for call in self.calls
            ),
            return_exceptions=True,
        )
        await asyncio.gather(
            *(
                call._reporter.drain()
                for call in self._calls.values()
                if call._reporter is not None
            ),
            return_exceptions=True,
        )
        for task in self._tasks:
            task.cancel()
        await asyncio.gather(*self._tasks, return_exceptions=True)

    async def place(
        self,
        to: str | Sequence[str],
        *,
        video: bool = False,
        exclusive: bool | None = None,
        idempotency_key: str | None = None,
    ) -> Call:
        body: CallPlacement = {"video": video}
        if isinstance(to, str):
            body["to"] = to
            peer = to
        else:
            body["participants"] = list(to)
            peer = to[0] if to else ""
        return await self._place(body, peer, exclusive, idempotency_key)

    async def place_group(
        self,
        group_id: str,
        *,
        video: bool = False,
        exclusive: bool | None = None,
        idempotency_key: str | None = None,
    ) -> Call:
        return await self._place(
            {"groupId": group_id, "video": video}, group_id, exclusive, idempotency_key
        )

    async def _place(
        self, body: CallPlacement, peer: str, exclusive: bool | None, key: str | None
    ) -> Call:
        generation = self._generation
        async with self._rest() as client:
            if (
                client._transport._credential is not None
                and client._transport._credential.kind != "client_token"
            ):
                body["session"] = self.session
            self._add_participant(body, client)
            if exclusive is not None:
                body["exclusive"] = exclusive
            response = await client.voip.place(
                body,
                options=RequestOptions(
                    idempotency_key=key or self._create_key(), max_network_retries=0
                ),
            )
            result = response.data.get("data")
        if (
            not isinstance(result, dict)
            or not isinstance(result.get("callId"), str)
            or not result["callId"]
        ):
            raise CallsError(
                "Invalid call placement response.",
                code="malformed_response",
                metadata=response.metadata,
            )
        call = Call(
            self,
            result["callId"],
            "outbound",
            peer,
            body.get("video", False),
            exclusive=exclusive is True,
        )
        if generation != self._generation:
            await call.end()
            raise CallsError("Call placement was cancelled.", code="cancelled")
        await self._track(call)
        return call

    async def _track(self, call: Call) -> None:
        self._calls[call.id] = call
        for event in self._pending.pop(call.id, []):
            await self._apply(call, event)

    def _ended(self, call: Call) -> None:
        self._ended_ids.append(call.id)
        while len(self._ended_ids) > 200:
            self._calls.pop(self._ended_ids.pop(0), None)

    async def _receive(self, event: LifecycleEvent) -> None:
        existing = self._calls.get(event.call_id)
        if event.event == "call.received":
            if existing is not None or event.payload.get("direction") == "outgoing":
                return
            peer = event.payload.get("from")
            if isinstance(peer, dict):
                peer = peer.get("phoneNumber") or peer.get("id") or peer.get("bsuid") or ""
            call = Call(
                self,
                event.call_id,
                "inbound",
                peer if isinstance(peer, str) else "",
                event.payload.get("hasVideo") is True or event.payload.get("has_video") is True,
            )
            await self._track(call)
            if not call.ended:
                if self.incoming.full():
                    raise CallsError("Incoming calls were not consumed.", code="event_queue_full")
                self.incoming.put_nowait(call)
        elif event.event in (
            "call.accepted",
            "call.ended",
            "call.missed",
            "call.rejected",
            "call.participant_joined",
            "call.participant_state",
            "call.participant_left",
        ):
            if existing is not None:
                await self._apply(existing, event)
            else:
                if event.call_id not in self._pending and len(self._pending) >= 64:
                    self._pending.popitem(last=False)
                queue = self._pending.setdefault(event.call_id, [])
                terminal = lambda item: item.event in ("call.ended", "call.missed", "call.rejected")
                if any(terminal(item) for item in queue):
                    return
                if terminal(event):
                    queue[:] = [event]
                elif event.event != "call.accepted" or not any(
                    item.event == event.event for item in queue
                ):
                    if len(queue) >= 8:
                        queue.pop(0)
                    queue.append(event)

    async def _apply(self, call: Call, event: LifecycleEvent) -> None:
        if call.ended:
            return
        if event.event == "call.accepted":
            call._answered = True
            answered_by = event.payload.get("answeredBy")
            if isinstance(answered_by, str):
                call._answered_by = answered_by
            reported = event.payload.get("capabilities")
            if isinstance(reported, dict):
                call.capabilities = CallCapabilities(
                    cast(bool, reported.get("video"))
                    if isinstance(reported.get("video"), bool)
                    else call.capabilities.video,
                    cast(bool, reported.get("invite"))
                    if isinstance(reported.get("invite"), bool)
                    else call.capabilities.invite,
                )
            call._exclusive = event.payload.get("exclusive") is True or call._claimed_by_us
            call._claimed_by_other = (
                call._exclusive
                and call._answered_by != self.participant_reference
                and not call._accepted
            )
            if call.direction == "outbound" and call.state == "ringing":
                call._accepted = True
                call._state("connecting")

                async def attach() -> None:
                    try:
                        await call._attach()
                    except Exception as cause:  # noqa: BLE001 - release must run for socket failures.
                        await call._release(cause)
                        await call._finish(
                            "claimed" if isinstance(cause, ConflictError) else "connection_failed"
                        )

                task = asyncio.create_task(attach())
                self._tasks.add(task)
                task.add_done_callback(self._tasks.discard)
        elif event.event in ("call.ended", "call.missed", "call.rejected"):
            reason = (
                event.payload.get("reason")
                if event.event == "call.ended"
                else event.event.removeprefix("call.")
            )
            await call._finish(reason if isinstance(reason, str) else "remote_hangup")
        elif event.event == "call.participant_left" and isinstance(
            event.payload.get("participantId"), str
        ):
            call._update_participant(cast(str, event.payload["participantId"]), None)
        elif _is_participant(event.payload.get("participant")):
            participant = cast(CallParticipant, event.payload["participant"])
            call._update_participant(participant["id"], participant)

    async def incoming_calls(self) -> AsyncIterator[Call]:
        while self.connected:
            yield await self.incoming.get()

    async def __aenter__(self) -> Self:
        await self.connect()
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.disconnect()
