"""Server-only local application client; service source8aa191e, no Signal cryptography."""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import json
import math
import re
import time
from collections.abc import AsyncIterator, Awaitable, Mapping
from dataclasses import asdict, dataclass, field
from typing import Literal, TypeAlias, cast
from urllib.parse import quote, urlsplit

import httpx
from typing_extensions import Self

from .direct_media import MediaUploadResult
from .errors import (
    AuthenticationError,
    AuthorizationError,
    ConfigurationError,
    ConflictError,
    ConnectionError,
    NotFoundError,
    PolymorfaError,
    RateLimitError,
    ServerError,
    TimeoutError,
    ValidationError,
    WebhookSignatureError,
)
from .media import MediaDescriptor
from .transport import Json

SIGNAL_NODE_SOURCE_COMMIT = "8aa191ef0d4c318229c91bcdf474bf2d79dac47c"
SignalMediaKind = Literal["image", "video", "audio", "document", "sticker"]
_MAX_JSON = 8 * 1024 * 1024


def _invalid() -> ServerError:
    return ServerError("Invalid local Signal service response.", code="invalid_response")


def _record(value: object) -> dict[str, Json]:
    if not isinstance(value, dict) or any(not isinstance(key, str) for key in value):
        raise _invalid()
    return cast(dict[str, Json], value)


def _string(value: object) -> str:
    if not isinstance(value, str):
        raise _invalid()
    return value


def _integer(value: object, lower: int = -(2**63), upper: int = 2**63 - 1) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or not lower <= value <= upper:
        raise _invalid()
    return value


def _boolean(value: object) -> bool:
    if not isinstance(value, bool):
        raise _invalid()
    return value


def _base64(value: str, *, length: int | None = None) -> bytes:
    try:
        result = base64.b64decode(value, validate=True)
    except (ValueError, UnicodeError):
        raise _invalid() from None
    if base64.b64encode(result).decode() != value or length is not None and len(result) != length:
        raise _invalid()
    return result


def _optional_string(record: Mapping[str, Json], key: str) -> str | None:
    value = record.get(key)
    return None if value is None else _string(value)


def _optional_integer(
    record: Mapping[str, Json], key: str, *, lower: int = -(2**63), upper: int = 2**63 - 1
) -> int | None:
    value = record.get(key)
    return None if value is None else _integer(value, lower, upper)


@dataclass(frozen=True, repr=False)
class SignalMediaDescriptor:
    kind: SignalMediaKind
    direct_path: str
    media_key: str
    file_sha256: str
    file_enc_sha256: str
    file_length: int
    mimetype: str
    url: str | None = None
    caption: str | None = None
    file_name: str | None = None
    width: int | None = None
    height: int | None = None
    seconds: int | None = None
    media_key_timestamp: int | None = None
    ptt: bool | None = None

    def __repr__(self) -> str:
        return "SignalMediaDescriptor(<redacted>)"

    @classmethod
    def from_wire(cls, value: object) -> SignalMediaDescriptor:
        data = _record(value)
        kind = data.get("kind")
        if kind not in ("image", "video", "audio", "document", "sticker"):
            raise _invalid()
        return cls(
            cast(SignalMediaKind, kind),
            _string(data.get("direct_path")),
            _string(data.get("media_key")),
            _string(data.get("file_sha256")),
            _string(data.get("file_enc_sha256")),
            _integer(data.get("file_length"), 0, 2**64 - 1),
            _string(data.get("mimetype")),
            _optional_string(data, "url"),
            _optional_string(data, "caption"),
            _optional_string(data, "file_name"),
            _optional_integer(data, "width", lower=0, upper=2**32 - 1),
            _optional_integer(data, "height", lower=0, upper=2**32 - 1),
            _optional_integer(data, "seconds", lower=0, upper=2**32 - 1),
            _optional_integer(data, "media_key_timestamp"),
            None if data.get("ptt") is None else _boolean(data["ptt"]),
        )

    def to_wire(self) -> dict[str, Json]:
        return cast(
            dict[str, Json],
            {key: value for key, value in asdict(self).items() if value is not None},
        )

    def validate_send(self) -> None:
        try:
            self.from_wire(self.to_wire())
            for value in (self.media_key, self.file_sha256, self.file_enc_sha256):
                _base64(value, length=32)
            if not self.direct_path or not self.mimetype or self.file_length == 0:
                raise _invalid()
            supported = {
                "image": {"caption", "width", "height"},
                "video": {"caption", "width", "height", "seconds"},
                "audio": {"seconds", "ptt"},
                "document": {"caption", "file_name"},
                "sticker": {"width", "height"},
            }[self.kind]
            if any(
                getattr(self, name) is not None and name not in supported
                for name in ("caption", "file_name", "width", "height", "seconds", "ptt")
            ):
                raise _invalid()
        except ServerError:
            raise ValidationError(
                "Invalid local Signal media descriptor.", code="invalid_request"
            ) from None

    def to_media_descriptor(self) -> MediaDescriptor:
        """Convert only a complete key/hash descriptor for local integrity-checked download."""
        return MediaDescriptor(
            self.kind,
            _base64(self.media_key, length=32),
            url=self.url,
            direct_path=self.direct_path,
            file_sha256=_base64(self.file_sha256, length=32),
            file_enc_sha256=_base64(self.file_enc_sha256, length=32),
            file_length=self.file_length,
            mimetype=self.mimetype,
            file_name=self.file_name,
        )


def to_signal_media_descriptor(
    upload: MediaUploadResult,
    *,
    caption: str | None = None,
    file_name: str | None = None,
    width: int | None = None,
    height: int | None = None,
    seconds: int | None = None,
    media_key_timestamp: int | None = None,
) -> SignalMediaDescriptor:
    result = SignalMediaDescriptor(
        "audio" if upload.media_type == "ptt" else upload.media_type,
        upload.direct_path,
        base64.b64encode(upload.media_key).decode(),
        base64.b64encode(upload.file_sha256).decode(),
        base64.b64encode(upload.file_enc_sha256).decode(),
        upload.file_length,
        upload.mimetype or "application/octet-stream",
        upload.url or None,
        caption,
        file_name,
        width,
        height,
        seconds,
        media_key_timestamp,
        upload.media_type == "ptt" if upload.media_type in ("audio", "ptt") else None,
    )
    result.validate_send()
    return result


@dataclass(frozen=True, repr=False)
class SignalTextMessage:
    to: str
    text: str

    def __repr__(self) -> str:
        return "SignalTextMessage(<redacted>)"


@dataclass(frozen=True, repr=False)
class SignalMediaMessage:
    to: str
    media: SignalMediaDescriptor

    def __repr__(self) -> str:
        return "SignalMediaMessage(<redacted>)"


SignalSendRequest: TypeAlias = SignalTextMessage | SignalMediaMessage


@dataclass(frozen=True, repr=False)
class SignalHistoryDescriptor:
    notification_proto: str
    direct_path: str | None = None
    media_key: str | None = None
    file_sha256: str | None = None
    file_enc_sha256: str | None = None
    original_message_id: str | None = None
    peer_data_request_session_id: str | None = None
    inline_payload: str | None = None
    sync_type: int | None = None
    chunk_order: int | None = None
    progress: int | None = None
    file_length: int | None = None

    def __repr__(self) -> str:
        return "SignalHistoryDescriptor(<redacted>)"

    @classmethod
    def from_wire(cls, value: object) -> SignalHistoryDescriptor:
        data = _record(value)
        return cls(
            _string(data.get("notification_proto")),
            _optional_string(data, "direct_path"),
            _optional_string(data, "media_key"),
            _optional_string(data, "file_sha256"),
            _optional_string(data, "file_enc_sha256"),
            _optional_string(data, "original_message_id"),
            _optional_string(data, "peer_data_request_session_id"),
            _optional_string(data, "inline_payload"),
            _optional_integer(data, "sync_type", lower=-(2**31), upper=2**31 - 1),
            _optional_integer(data, "chunk_order", lower=0, upper=2**32 - 1),
            _optional_integer(data, "progress", lower=0, upper=2**32 - 1),
            _optional_integer(data, "file_length", lower=0, upper=2**64 - 1),
        )

    def notification_bytes(self) -> bytes:
        return _base64(self.notification_proto)

    def inline_bytes(self) -> bytes | None:
        return None if self.inline_payload is None else _base64(self.inline_payload)


@dataclass(frozen=True, repr=False)
class SignalNodeEvent:
    id: str
    type: Literal["message", "history.sync"]
    session_id: str
    chat: str
    sender: str
    message_id: str
    timestamp: int
    is_from_me: bool
    redelivered: bool
    identity_changed: bool
    message_proto: str
    sender_alt: str | None = None
    text: str | None = None
    media: SignalMediaDescriptor | None = None
    history: SignalHistoryDescriptor | None = None
    raw: dict[str, Json] = field(default_factory=dict)

    def __repr__(self) -> str:
        return "SignalNodeEvent(<redacted>)"

    @classmethod
    def from_wire(cls, value: object) -> SignalNodeEvent:
        data = _record(value)
        kind = data.get("type")
        if kind not in ("message", "history.sync"):
            raise _invalid()
        return cls(
            _string(data.get("id")),
            cast(Literal["message", "history.sync"], kind),
            _string(data.get("session_id")),
            _string(data.get("chat")),
            _string(data.get("sender")),
            _string(data.get("message_id")),
            _integer(data.get("timestamp")),
            _boolean(data.get("is_from_me")),
            _boolean(data.get("redelivered")),
            _boolean(data.get("identity_changed")),
            _string(data.get("message_proto")),
            _optional_string(data, "sender_alt"),
            _optional_string(data, "text"),
            SignalMediaDescriptor.from_wire(data["media"])
            if data.get("media") is not None
            else None,
            SignalHistoryDescriptor.from_wire(data["history"])
            if data.get("history") is not None
            else None,
            data,
        )

    def message_bytes(self) -> bytes:
        return _base64(self.message_proto)


@dataclass(frozen=True)
class SignalSendOutcome:
    message_id: str
    server_timestamp: int
    resent: bool


@dataclass(frozen=True, repr=False)
class SignalSession:
    id: str
    lease_generation: int
    claimed: bool
    has_device_keys: bool
    state: str
    pn: str | None
    lid: str | None

    def __repr__(self) -> str:
        return "SignalSession(<redacted>)"


@dataclass(frozen=True, repr=False)
class SignalSessions:
    node_id: str
    sessions: tuple[SignalSession, ...]

    def __repr__(self) -> str:
        return "SignalSessions(<redacted>)"


def _unique(pairs: list[tuple[str, Json]]) -> dict[str, Json]:
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError("Duplicate JSON field")
        result[key] = value
    return result


def _reject_constant(value: str) -> None:
    raise ValueError("Nonfinite JSON number")


def _parse_json(raw: bytes) -> Json:
    try:
        value = json.loads(raw, object_pairs_hook=_unique, parse_constant=_reject_constant)
        stack = [(value, 0)]
        count = 0
        while stack:
            item, depth = stack.pop()
            count += 1
            if depth > 64 or count > 200000 or isinstance(item, float) and not math.isfinite(item):
                raise ValueError("JSON bounds exceeded")
            if isinstance(item, dict):
                stack.extend((child, depth + 1) for child in item.values())
            elif isinstance(item, list):
                stack.extend((child, depth + 1) for child in item)
    except (ValueError, RecursionError):
        raise _invalid() from None
    return cast(Json, value)


def _safe_error(status: int, raw: bytes) -> PolymorfaError:
    known = {
        "unauthorized",
        "origin_forbidden",
        "invalid_request",
        "unknown_session",
        "not_lease_holder",
        "session_not_paired",
        "disconnected",
        "rate_limited",
        "session_unavailable",
        "refused",
        "unavailable",
        "send_failed",
        "stream_disabled",
        "unknown_event",
    }
    code = "signal_service_error"
    try:
        data = _record(_parse_json(raw))
        error = data.get("error")
        if isinstance(error, dict):
            supplied = error.get("code")
            if isinstance(supplied, str) and supplied in known:
                code = supplied
    except ServerError:
        pass
    error_type = {
        400: ValidationError,
        401: AuthenticationError,
        403: AuthorizationError,
        404: NotFoundError,
        409: ConflictError,
        429: RateLimitError,
    }.get(status, ServerError)
    return error_type(
        f"Local Signal service request failed (HTTP {status}).", code=code, status=status
    )


def _segment(value: str) -> str:
    if not isinstance(value, str) or not value or len(value) > 512:
        raise ConfigurationError("identifier")
    return quote(value, safe="")


class SignalNodeClient:
    """Owns only its local HTTP transport; never accepts an upstream Polymorfa credential."""

    def __init__(
        self,
        application_secret: str,
        *,
        base_url: str = "http://127.0.0.1:8080",
        timeout: float = 30,
        allow_insecure_http: bool = False,
        http_transport: httpx.AsyncBaseTransport | None = None,
        max_event_bytes: int = _MAX_JSON,
    ) -> None:
        parsed = urlsplit(base_url)
        if (
            parsed.scheme not in ("http", "https")
            or not parsed.hostname
            or parsed.username is not None
            or parsed.password is not None
            or parsed.query
            or parsed.fragment
            or parsed.path not in ("", "/")
            or parsed.scheme == "http"
            and parsed.hostname not in ("localhost", "127.0.0.1", "::1")
            and not allow_insecure_http
        ):
            raise ConfigurationError("base_url")
        if (
            not isinstance(application_secret, str)
            or re.fullmatch(r"[!-~]{16,8192}", application_secret) is None
            or application_secret.startswith("pmfa_")
        ):
            raise ConfigurationError("application_secret")
        if (
            not math.isfinite(timeout)
            or timeout <= 0
            or isinstance(max_event_bytes, bool)
            or not isinstance(max_event_bytes, int)
            or not 1 <= max_event_bytes <= 32 * 1024 * 1024
        ):
            raise ConfigurationError("timeout_or_event_limit")
        self._url, self._secret, self._timeout, self._max_event_bytes = (
            base_url.rstrip("/"),
            application_secret,
            timeout,
            max_event_bytes,
        )
        self._client = httpx.AsyncClient(
            transport=http_transport, trust_env=False, follow_redirects=False, timeout=timeout
        )
        self._closed = asyncio.Event()
        self._streams: set[SignalEventStream] = set()

    def __repr__(self) -> str:
        return "SignalNodeClient()"

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()

    def _request(
        self,
        method: str,
        path: str,
        *,
        body: Json = None,
        public: bool = False,
        query: Mapping[str, str] | None = None,
        streaming: bool = False,
    ) -> httpx.Request:
        if self._closed.is_set():
            raise ConfigurationError("closed_signal_client")
        headers = {
            "Accept-Encoding": "identity",
            "Accept": "text/event-stream" if streaming else "application/json",
        }
        if not public:
            headers["Authorization"] = "Bearer " + self._secret
        content = None
        if body is not None:
            content = json.dumps(body, separators=(",", ":"), allow_nan=False).encode()
            if len(content) > _MAX_JSON:
                raise ValidationError(
                    "Local Signal request exceeds its byte limit.", code="invalid_request"
                )
            headers["Content-Type"] = "application/json"
        # Request(), rather than build_request(), deliberately inherits no cookie jar.
        request = httpx.Request(
            method, self._url + path, headers=headers, content=content, params=query
        )
        request.extensions["timeout"] = httpx.Timeout(
            self._timeout, read=45 if streaming else self._timeout
        ).as_dict()
        return request

    async def _open(self, request: httpx.Request) -> httpx.Response:
        try:
            response = await self._client.send(request, stream=True, follow_redirects=False)
        except httpx.TimeoutException:
            raise TimeoutError(
                "Local Signal service timed out; a send may have completed.", code="request_timeout"
            ) from None
        except httpx.TransportError:
            raise ConnectionError(
                "Local Signal service could not be reached.", code="connection_error"
            ) from None
        if response.headers.get("content-encoding", "identity").lower() != "identity":
            await response.aclose()
            raise _invalid()
        return response

    async def _body(self, response: httpx.Response, limit: int) -> bytes:
        raw = bytearray()
        if response.is_stream_consumed:
            if len(response.content) > limit:
                raise _invalid()
            return response.content
        async for chunk in response.aiter_raw():
            if len(chunk) > limit - len(raw):
                raise _invalid()
            raw.extend(chunk)
        return bytes(raw)

    async def _json_once(
        self, method: str, path: str, body: Json, public: bool, expected_status: int
    ) -> Json:
        response = await self._open(self._request(method, path, body=body, public=public))
        try:
            raw = await self._body(response, _MAX_JSON)
            if not response.is_success:
                raise _safe_error(response.status_code, raw)
            if response.status_code != expected_status:
                raise _invalid()
            if response.status_code == 204:
                if raw:
                    raise _invalid()
                return None
            if (
                response.headers.get("content-type", "").split(";")[0].strip().lower()
                != "application/json"
            ):
                raise _invalid()
            return _parse_json(raw)
        finally:
            await response.aclose()

    async def _json(
        self,
        method: str,
        path: str,
        body: Json = None,
        *,
        public: bool = False,
        expected_status: int = 200,
    ) -> Json:
        try:
            return await asyncio.wait_for(
                self._json_once(method, path, body, public, expected_status), self._timeout
            )
        except (asyncio.TimeoutError, httpx.TimeoutException):
            raise TimeoutError(
                "Local Signal service timed out; a send may have completed.", code="request_timeout"
            ) from None
        except httpx.TransportError:
            raise ConnectionError(
                "Local Signal service response was interrupted; a send may have completed.",
                code="connection_error",
            ) from None

    async def health(self) -> Literal["ok"]:
        data = _record(await self._json("GET", "/healthz", public=True))
        if data.get("status") != "ok":
            raise _invalid()
        return "ok"

    async def list_sessions(self) -> SignalSessions:
        data = _record(await self._json("GET", "/v1/sessions"))
        values = data.get("sessions")
        if not isinstance(values, list):
            raise _invalid()
        sessions = []
        for item in values:
            row = _record(item)
            if "pn" not in row or "lid" not in row:
                raise _invalid()
            sessions.append(
                SignalSession(
                    _string(row.get("id")),
                    _integer(row.get("lease_generation"), 0, 2**64 - 1),
                    _boolean(row.get("claimed")),
                    _boolean(row.get("has_device_keys")),
                    _string(row.get("state")),
                    _optional_string(row, "pn"),
                    _optional_string(row, "lid"),
                )
            )
        return SignalSessions(_string(data.get("node_id")), tuple(sessions))

    async def send_message(self, session_id: str, request: SignalSendRequest) -> SignalSendOutcome:
        if (
            not isinstance(request, (SignalTextMessage, SignalMediaMessage))
            or not isinstance(request.to, str)
            or not request.to
        ):
            raise ValidationError(
                "A local Signal message target is required.", code="invalid_request"
            )
        body: dict[str, Json] = {"to": request.to}
        if isinstance(request, SignalTextMessage):
            if not isinstance(request.text, str) or not request.text:
                raise ValidationError(
                    "Local Signal text must not be empty.", code="invalid_request"
                )
            body["text"] = request.text
        else:
            if not isinstance(request.media, SignalMediaDescriptor):
                raise ValidationError(
                    "A local Signal media descriptor is required.", code="invalid_request"
                )
            request.media.validate_send()
            body["media"] = request.media.to_wire()
        data = _record(
            await self._json("POST", "/v1/sessions/" + _segment(session_id) + "/messages", body)
        )
        return SignalSendOutcome(
            _string(data.get("message_id")),
            _integer(data.get("server_timestamp")),
            _boolean(data.get("resent")),
        )

    async def send_text(self, session_id: str, to: str, text: str) -> SignalSendOutcome:
        return await self.send_message(session_id, SignalTextMessage(to, text))

    async def send_media(
        self, session_id: str, to: str, media: SignalMediaDescriptor
    ) -> SignalSendOutcome:
        return await self.send_message(session_id, SignalMediaMessage(to, media))

    async def acknowledge_event(self, event_id: str) -> None:
        value = await self._json(
            "POST", "/v1/events/" + _segment(event_id) + "/ack", expected_status=204
        )
        if value is not None:
            raise _invalid()

    def events(
        self, *, session_id: str | None = None, reconnect: bool = True, reconnect_delay: float = 0.5
    ) -> SignalEventStream:
        if self._closed.is_set():
            raise ConfigurationError("closed_signal_client")
        if session_id is not None:
            _segment(session_id)
        if not math.isfinite(reconnect_delay) or not 0 <= reconnect_delay <= 60:
            raise ConfigurationError("reconnect_delay")
        stream = SignalEventStream(self, session_id, reconnect, reconnect_delay)
        self._streams.add(stream)
        return stream

    async def close(self) -> None:
        self._closed.set()
        try:
            await asyncio.gather(
                *(stream.close() for stream in tuple(self._streams)), return_exceptions=True
            )
        finally:
            await self._client.aclose()


class SignalEventStream:
    def __init__(
        self, client: SignalNodeClient, session: str | None, reconnect: bool, delay: float
    ) -> None:
        self._client, self._session, self._reconnect, self._delay = (
            client,
            session,
            reconnect,
            delay,
        )
        self._closed = asyncio.Event()
        self._response: httpx.Response | None = None
        self._active = False

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()

    def __aiter__(self) -> AsyncIterator[SignalNodeEvent]:
        if self._active:
            raise ConfigurationError("signal_stream_single_consumer")
        self._active = True
        return self._run()

    async def _run(self) -> AsyncIterator[SignalNodeEvent]:
        try:
            while not self._closed.is_set() and not self._client._closed.is_set():
                try:
                    request = self._client._request(
                        "GET",
                        "/v1/events",
                        query={"session_id": self._session} if self._session is not None else None,
                        streaming=True,
                    )
                    response = await self._until_close(self._client._open(request))
                    if response is None:
                        return
                    self._response = response
                    try:
                        if not response.is_success:
                            raise _safe_error(
                                response.status_code, await self._client._body(response, _MAX_JSON)
                            )
                        if (
                            response.headers.get("content-type", "").split(";")[0].strip().lower()
                            != "text/event-stream"
                        ):
                            raise _invalid()
                        async for event in self._records(response):
                            yield event
                    finally:
                        self._response = None
                        await response.aclose()
                except (ConnectionError, TimeoutError, httpx.TransportError):
                    if not self._reconnect and not self._closed.is_set():
                        raise ConnectionError(
                            "Local Signal event stream disconnected.", code="connection_error"
                        ) from None
                if not self._reconnect or self._closed.is_set() or self._client._closed.is_set():
                    return
                try:
                    await asyncio.wait_for(self._closed.wait(), max(0.05, self._delay))
                except asyncio.TimeoutError:
                    pass
        finally:
            await self.close()

    async def _until_close(self, operation: Awaitable[httpx.Response]) -> httpx.Response | None:
        opening = asyncio.ensure_future(operation)
        closing = asyncio.create_task(self._closed.wait())
        delivered = False
        try:
            done, _ = await asyncio.wait(
                (opening, closing),
                timeout=self._client._timeout,
                return_when=asyncio.FIRST_COMPLETED,
            )
            if closing in done:
                return None
            if opening not in done:
                raise TimeoutError(
                    "Local Signal stream handshake timed out.", code="request_timeout"
                )
            response = opening.result()
            delivered = True
            return response
        finally:
            for pending in (opening, closing):
                if not pending.done():
                    pending.cancel()
            await asyncio.gather(opening, closing, return_exceptions=True)
            if not delivered and not opening.cancelled() and opening.exception() is None:
                await opening.result().aclose()

    async def _next_chunk(self, source: AsyncIterator[bytes]) -> bytes | None:
        reading = asyncio.ensure_future(source.__anext__())
        closing = asyncio.create_task(self._closed.wait())
        try:
            done, _ = await asyncio.wait((reading, closing), return_when=asyncio.FIRST_COMPLETED)
            if closing in done:
                return None
            try:
                return reading.result()
            except StopAsyncIteration:
                return None
        finally:
            for pending in (reading, closing):
                if not pending.done():
                    pending.cancel()
            await asyncio.gather(reading, closing, return_exceptions=True)

    async def _chunks(self, response: httpx.Response) -> AsyncIterator[bytes]:
        # Do not set httpx chunk_size: it would buffer small live SSE records
        # until 64KiB and prevent acknowledgement before the service deadline.
        async for raw in response.aiter_bytes():
            for offset in range(0, len(raw), 65536):
                yield raw[offset : offset + 65536]

    async def _records(self, response: httpx.Response) -> AsyncIterator[SignalNodeEvent]:
        # Incremental byte framing bounds a line before UTF-8 and JSON allocation.
        buffer = bytearray()
        data: list[str] = []
        size = 0
        identity = None
        kind = None
        source = self._chunks(response).__aiter__()
        while not self._closed.is_set():
            chunk = await self._next_chunk(source)
            if chunk is None:
                break
            buffer.extend(chunk)
            while (newline := buffer.find(b"\n")) >= 0:
                if newline > self._client._max_event_bytes:
                    raise _invalid()
                try:
                    line = bytes(buffer[:newline]).rstrip(b"\r").decode("utf-8")
                except UnicodeError:
                    raise _invalid() from None
                del buffer[: newline + 1]
                if not line:
                    if data:
                        event = SignalNodeEvent.from_wire(_parse_json("\n".join(data).encode()))
                        if (
                            identity != event.id
                            or kind != event.type
                            or self._session is not None
                            and event.session_id != self._session
                        ):
                            raise _invalid()
                        yield event
                    data = []
                    size = 0
                    identity = None
                    kind = None
                elif not line.startswith(":"):
                    name, _, text = line.partition(":")
                    text = text.removeprefix(" ")
                    size += len(line.encode())
                    if size > self._client._max_event_bytes:
                        raise _invalid()
                    if name == "data":
                        data.append(text)
                    elif name == "id":
                        identity = text
                    elif name == "event":
                        kind = text
            if len(buffer) > self._client._max_event_bytes:
                raise _invalid()
        if not self._closed.is_set() and (buffer or data):
            raise ConnectionError(
                "Local Signal stream ended in a partial event.", code="connection_error"
            )

    async def close(self) -> None:
        self._closed.set()
        try:
            if self._response is not None:
                await self._response.aclose()
        finally:
            self._client._streams.discard(self)


def verify_signal_node_webhook(
    body: bytes,
    headers: Mapping[str, str],
    webhook_secret: str,
    *,
    now: int | None = None,
    max_age: int = 300,
    max_body_bytes: int = _MAX_JSON,
) -> SignalNodeEvent:
    if (
        not isinstance(webhook_secret, str)
        or len(webhook_secret.encode()) < 16
        or webhook_secret.startswith("pmfa_")
    ):
        raise ConfigurationError("webhook_secret")
    if (
        isinstance(max_age, bool)
        or not isinstance(max_age, int)
        or max_age < 0
        or isinstance(max_body_bytes, bool)
        or not isinstance(max_body_bytes, int)
        or max_body_bytes < 1
    ):
        raise ConfigurationError("webhook_limits")
    if not isinstance(body, bytes) or len(body) > max_body_bytes:
        raise WebhookSignatureError("Invalid local Signal webhook.", code="invalid_webhook")
    normalized = {key.lower(): value for key, value in headers.items()}
    timestamp = normalized.get("signal-node-timestamp", "")
    signature = normalized.get("signal-node-signature", "")
    event_id = normalized.get("signal-node-event-id", "")
    if (
        re.fullmatch(r"-?(0|[1-9][0-9]{0,18})", timestamp) is None
        or re.fullmatch(r"v1=[a-fA-F0-9]{64}", signature) is None
    ):
        raise WebhookSignatureError("Invalid local Signal webhook.", code="invalid_webhook")
    observed = int(timestamp)
    current = int(time.time()) if now is None else now
    expected = hmac.new(
        webhook_secret.encode(), str(observed).encode() + b"." + body, hashlib.sha256
    ).hexdigest()
    if (
        not -(2**63) <= observed <= 2**63 - 1
        or abs(current - observed) > max_age
        or not hmac.compare_digest(signature[3:].lower(), expected)
    ):
        raise WebhookSignatureError("Invalid local Signal webhook.", code="invalid_webhook")
    event = SignalNodeEvent.from_wire(_parse_json(body))
    if event.id != event_id:
        raise WebhookSignatureError("Invalid local Signal webhook.", code="invalid_webhook")
    return event
