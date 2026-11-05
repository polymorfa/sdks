"""Pending 2026-10-14 upload/history API and credential-free WhatsApp egress."""

from __future__ import annotations

import asyncio
import base64
import re
from collections.abc import AsyncGenerator, Mapping
from dataclasses import dataclass, field, replace
from typing import Literal, Protocol, cast
from urllib.parse import parse_qsl, quote, urlencode, urlsplit, urlunsplit

import httpx
from typing_extensions import NotRequired, TypedDict

from . import campaign_contract_validation as V
from .errors import (
    ConfigurationError,
    ConnectionError,
    MediaIntegrityError,
    PolymorfaError,
    ServerError,
    TimeoutError,
)
from .media import MAX_BYTES, is_whatsapp_media_url
from .media_encrypt import (
    EncryptedMediaInfo,
    EncryptedUploadBody,
    MediaSource,
    UploadMediaType,
    positive_integer,
    prepare_whatsapp_upload,
)
from .transport import DEFAULT_OPTIONS, ApiResponse, Json, RequestOptions, Transport

CUSTOMER_OWNED_API_VERSION = "2026-10-14"
HistorySyncType = Literal[
    "INITIAL_BOOTSTRAP",
    "INITIAL_STATUS_V3",
    "FULL",
    "RECENT",
    "PUSH_NAME",
    "NON_BLOCKING_DATA",
    "ON_DEMAND",
]
HISTORY_SYNC_TYPES: tuple[HistorySyncType, ...] = (
    "INITIAL_BOOTSTRAP",
    "INITIAL_STATUS_V3",
    "FULL",
    "RECENT",
    "PUSH_NAME",
    "NON_BLOCKING_DATA",
    "ON_DEMAND",
)


def segment(value: str) -> str:
    if not isinstance(value, str) or not value:
        raise ConfigurationError("identifier")
    return quote(value, safe="")


class HistoryChunkRetry(TypedDict):
    syncType: HistorySyncType
    chunkOrder: int
    chunkMessageId: NotRequired[str]
    regenerate: NotRequired[bool]


class HistorySyncChunkRetryResult(TypedDict):
    requestId: str
    status: Literal["requested"]


class HistoryChunkDelete(TypedDict):
    directPath: str
    fileEncSha256: str
    encHandle: NotRequired[str]
    companionMetaNonce: NotRequired[str]


class MediaSendDescriptor(TypedDict):
    directPath: str
    mediaKey: str
    fileSha256: str
    fileEncSha256: str
    fileLength: int
    mimeType: str
    url: str
    mediaKeyTimestamp: NotRequired[int]
    isAnimated: NotRequired[bool]
    thumbnail: NotRequired[str]
    width: NotRequired[int]
    height: NotRequired[int]
    seconds: NotRequired[int]
    waveform: NotRequired[str]


def owned_options(options: RequestOptions) -> RequestOptions:
    return replace(
        options,
        api_version=options.api_version
        if options.api_version is not None
        else CUSTOMER_OWNED_API_VERSION,
    )


def submission_options(options: RequestOptions) -> RequestOptions:
    # The four held API routes have no replay ledger, even with a caller key.
    return replace(owned_options(options), max_network_retries=0)


def base64url_unpadded(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _invalid(what: str) -> ServerError:
    return ServerError(f"Invalid {what} response.", code="invalid_response")


def _unwrap(value: Json) -> dict[str, Json]:
    if not isinstance(value, dict):
        raise _invalid("media")
    data = value.get("data", value)
    if not isinstance(data, dict):
        raise _invalid("media")
    return data


def _invalid_ack(response: ApiResponse[Json]) -> ServerError:
    return ServerError(
        "Invalid API acknowledgement.",
        code="invalid_response",
        status=response.metadata.status,
        metadata=response.metadata,
    )


def _acknowledgement(response: ApiResponse[Json]) -> dict[str, Json]:
    value = response.data
    if (
        response.metadata.status != 200
        or response.metadata.headers.get("content-type", "").split(";", 1)[0].strip().lower()
        != "application/json"
        or not isinstance(value, dict)
        or value.get("success") is not True
        or not isinstance(value.get("data"), dict)
    ):
        raise _invalid_ack(response)
    return cast(dict[str, Json], value["data"])


def _upload_fields(info: EncryptedMediaInfo) -> dict[str, Json]:
    kind = (
        "file"
        if info.media_type == "document"
        else "voice"
        if info.media_type in ("audio", "ptt")
        else info.media_type
    )
    body: dict[str, Json] = {
        "type": kind,
        "fileEncSha256": base64url_unpadded(info.file_enc_sha256),
    }
    if kind == "voice":
        body["ptt"] = info.media_type == "ptt"
    return body


@dataclass(frozen=True)
class UploadGrant:
    host: str
    expires_at: int
    upload_url: str = field(repr=False)


@dataclass(frozen=True)
class UploadLocation:
    direct_path: str = field(repr=False)
    url: str = field(repr=False)
    handle: str | None = field(default=None, repr=False)


@dataclass(frozen=True)
class MediaUploadResult(EncryptedMediaInfo):
    direct_path: str = field(default="", repr=False)
    url: str = field(default="", repr=False)
    handle: str | None = field(default=None, repr=False)
    egress: str = "relay"


def _location(value: Json, *, provider: bool = False) -> UploadLocation:
    record = _unwrap(value)
    path, url = record.get("direct_path" if provider else "directPath"), record.get("url")
    if (
        not isinstance(path, str)
        or re.fullmatch(r"/(?!/)[!-~]{1,2047}", path) is None
        or not isinstance(url, str)
        or not is_whatsapp_media_url(url)
    ):
        raise _invalid("upload location")
    handle = record.get("handle")
    return UploadLocation(path, url, handle if isinstance(handle, str) and handle else None)


class DirectMediaApi:
    def __init__(self, transport: Transport) -> None:
        self._transport = transport

    def require_direct(self) -> None:
        if self._transport.credential_kind not in ("organization_api_key", "project_token"):
            raise ConfigurationError("credential")

    async def create_upload_grant(
        self, session: str, info: EncryptedMediaInfo, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> UploadGrant:
        self.require_direct()
        response = await self._transport.request_json(
            "POST",
            f"/messaging/{segment(session)}/media/upload-grants",
            body=_upload_fields(info),
            options=submission_options(options),
        )
        data = _acknowledgement(response)
        host, url, expiry = data.get("host"), data.get("uploadUrl"), data.get("expiresAt")
        if (
            not isinstance(url, str)
            or not is_whatsapp_media_url(url)
            or not isinstance(host, str)
            or urlsplit(url).hostname != host
            or not dict(parse_qsl(urlsplit(url).query)).get("auth")
            or isinstance(expiry, bool)
            or not isinstance(expiry, int)
            or not 0 < expiry <= 8_640_000_000_000
        ):
            raise ServerError(
                "Invalid upload grant response.",
                code="invalid_response",
                status=response.metadata.status,
                metadata=response.metadata,
            )
        return UploadGrant(host, expiry, url)

    async def relay_upload(
        self, session: str, body: EncryptedUploadBody, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> UploadLocation:
        fields = _upload_fields(body.info)
        query = {
            key: str(value).lower() if isinstance(value, bool) else cast(str, value)
            for key, value in fields.items()
        }
        source = body.open()
        try:
            response = await self._transport.request_binary_json(
                "POST",
                f"/messaging/{segment(session)}/media/uploads",
                source,
                body.info.encrypted_length,
                query=query,
                options=submission_options(options),
            )
            data = _acknowledgement(response)
            try:
                return _location(data)
            except ServerError:
                raise _invalid_ack(response) from None
        finally:
            await source.aclose()


class HistorySync:
    def __init__(self, transport: Transport, credential: str = "organization_api_key") -> None:
        self._transport, self._credential = transport, transport.credential_kind

    def _server(self) -> None:
        if self._credential not in ("organization_api_key", "project_token"):
            raise ConfigurationError("credential")

    async def request_chunk_retry(
        self, session: str, body: HistoryChunkRetry, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> HistorySyncChunkRetryResult:
        self._server()
        if (
            set(body) - {"syncType", "chunkOrder", "chunkMessageId", "regenerate"}
            or body.get("syncType") not in HISTORY_SYNC_TYPES
        ):
            raise ConfigurationError("syncType")
        order = body.get("chunkOrder")
        if isinstance(order, bool) or not isinstance(order, int) or not 0 <= order <= 2**32 - 1:
            raise ConfigurationError("chunkOrder")
        message_id = body.get("chunkMessageId")
        if "chunkMessageId" in body and (
            not isinstance(message_id, str)
            or re.fullmatch(r"[A-Za-z0-9._:-]{1,128}", message_id) is None
        ):
            raise ConfigurationError("chunkMessageId")
        if "regenerate" in body and not isinstance(body["regenerate"], bool):
            raise ConfigurationError("regenerate")
        response = await self._transport.request_json(
            "POST",
            f"/messaging/{segment(session)}/history/chunks/retry",
            body=V.capture(body),
            options=submission_options(options),
        )
        data = _acknowledgement(response)
        if (
            not isinstance(data.get("requestId"), str)
            or not data["requestId"]
            or data.get("status") != "requested"
        ):
            raise _invalid_ack(response)
        return cast(HistorySyncChunkRetryResult, data)

    async def delete_chunk(
        self, session: str, body: HistoryChunkDelete, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> None:
        self._server()
        path, digest = body.get("directPath"), body.get("fileEncSha256")
        if (
            set(body) - {"directPath", "fileEncSha256", "encHandle", "companionMetaNonce"}
            or not isinstance(path, str)
            or len(path) > 1024
            or re.fullmatch(r"/[A-Za-z0-9._~%/=&?+-]+", path) is None
        ):
            raise ConfigurationError("directPath")
        if not isinstance(digest, str) or re.fullmatch(r"[A-Za-z0-9+/]{43}=", digest) is None:
            raise ConfigurationError("fileEncSha256")
        for key in ("encHandle", "companionMetaNonce"):
            if key in body and (
                not isinstance(body[key], str)
                or re.fullmatch(r"[A-Za-z0-9._~%/=+-]{1,512}", body[key]) is None
            ):
                raise ConfigurationError(key)
        response = await self._transport.request_json(
            "POST",
            f"/messaging/{segment(session)}/history/media/delete",
            body=V.capture(body),
            options=submission_options(options),
        )

        data = _acknowledgement(response)
        if data.get("status") != "deleted":
            raise _invalid_ack(response)


class MediaUploadTransport(Protocol):
    @property
    def name(self) -> str: ...
    async def upload(
        self, session: str, body: EncryptedUploadBody, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> UploadLocation: ...


class RelayUploadTransport:
    name = "relay"

    def __init__(self, api: DirectMediaApi) -> None:
        self._api = api

    async def upload(
        self, session: str, body: EncryptedUploadBody, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> UploadLocation:
        return await self._api.relay_upload(session, body, options=options)


class _AttemptError(Exception):
    def __init__(self, status: int | None) -> None:
        self.status = status
        self.retryable = status is None or status in (401, 408) or status >= 500 and status != 507
        code = {
            413: "media_too_large",
            415: "media_upload_hash_mismatch",
            507: "media_upload_throttled",
            401: "media_upload_unauthorized",
        }.get(status or 0, "media_upload_failed")
        self.final = (
            ConnectionError(
                "The WhatsApp media host could not be reached.", code="connection_error"
            )
            if status is None
            else PolymorfaError(
                f"The WhatsApp media host returned status {status}.", code=code, status=status
            )
        )
        super().__init__(code)


class DirectUploadTransport:
    name = "direct"

    def __init__(
        self,
        api: DirectMediaApi,
        *,
        http_transport: httpx.AsyncBaseTransport | None = None,
        max_attempts: int = 3,
        document_part_size: int = 50 * 1024 * 1024,
    ) -> None:
        api.require_direct()
        positive_integer(max_attempts, "max_attempts")
        positive_integer(document_part_size, "document_part_size")
        self._api, self._http_transport = api, http_transport
        self._attempts, self._part_size = max_attempts, document_part_size

    def require_direct(self) -> None:
        self._api.require_direct()

    def _url(self, grant: UploadGrant, body: EncryptedUploadBody, query: Mapping[str, str]) -> str:
        parsed = urlsplit(grant.upload_url)
        if (
            parsed.path
            != f"/mms/{body.info.media_type}/{base64url_unpadded(body.info.file_enc_sha256)}"
        ):
            raise _invalid("upload grant")
        if not query:
            return grant.upload_url
        params = [
            (key, value)
            for key, value in parse_qsl(parsed.query, keep_blank_values=True)
            if key not in query
        ]
        params.extend(query.items())
        return urlunsplit((parsed.scheme, parsed.netloc, parsed.path, urlencode(params), ""))

    async def upload(
        self, session: str, body: EncryptedUploadBody, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> UploadLocation:
        self.require_direct()

        async def run() -> UploadLocation:
            async with httpx.AsyncClient(
                transport=self._http_transport,
                follow_redirects=False,
                timeout=options.timeout or 30,
            ) as client:
                grant = await self._api.create_upload_grant(session, body.info, options=options)

                parts: _SequentialParts | None = None

                async def post(
                    query: Mapping[str, str],
                    payload: AsyncGenerator[bytes, None] | None,
                    length: int,
                ) -> Json:
                    headers = {
                        "origin": "https://web.whatsapp.com",
                        "referer": "https://web.whatsapp.com/",
                    }
                    if payload is not None:
                        headers["content-length"] = str(length)
                    try:
                        response = await client.post(
                            self._url(grant, body, query), headers=headers, content=payload
                        )
                    except httpx.TransportError:
                        raise _AttemptError(None) from None
                    finally:
                        if payload is not None:
                            await payload.aclose()
                    if not response.is_success:
                        raise _AttemptError(response.status_code)
                    if not response.content:
                        return None
                    try:
                        return cast(Json, response.json())
                    except ValueError:
                        raise _invalid("upload") from None

                async def operation(
                    query: Mapping[str, str],
                    *,
                    start: int = 0,
                    length: int | None = None,
                    resume: bool = False,
                ) -> Json:
                    nonlocal grant
                    last: _AttemptError | None = None
                    for attempt in range(self._attempts):
                        try:
                            if last is not None and last.status == 401:
                                grant = await self._api.create_upload_grant(
                                    session, body.info, options=options
                                )
                            offset = start
                            actual_query = dict(query)
                            if attempt and resume:
                                try:
                                    progress = await post({"resume": "1"}, None, 0)
                                except _AttemptError as error:
                                    if error.status != 404:
                                        raise
                                    progress = None
                                record = progress if isinstance(progress, dict) else {}
                                if record.get("resume") == "complete":
                                    return record
                                candidate = record.get("resume")
                                if (
                                    isinstance(candidate, str)
                                    and candidate.isascii()
                                    and candidate.isdigit()
                                ):
                                    parsed_offset = int(candidate) if len(candidate) < 20 else 0
                                    if 0 < parsed_offset < body.info.encrypted_length:
                                        offset = parsed_offset
                                        actual_query.update(
                                            bytestart=str(offset),
                                            byteend=str(body.info.encrypted_length),
                                        )
                            count = (
                                body.info.encrypted_length - offset if length is None else length
                            )
                            source = (
                                None
                                if length == 0
                                else parts.part(offset, count)
                                if parts is not None
                                else _range(body, offset, count)
                            )
                            return await post(actual_query, source, count)
                        except _AttemptError as error:
                            last = error
                            if not error.retryable:
                                raise error.final from None
                    assert last is not None
                    raise last.final from None

                total = body.info.encrypted_length
                if body.info.media_type == "document" and total > self._part_size:
                    parts = _SequentialParts(body)
                    try:
                        for start in range(0, total, self._part_size):
                            end = min(start + self._part_size, total)
                            await operation(
                                {"stream": "1", "bytestart": str(start), "byteend": str(end)},
                                start=start,
                                length=end - start,
                            )
                    finally:
                        await parts.close()
                    value = await operation(
                        {
                            "stream": "1",
                            "final_hash": base64url_unpadded(body.info.file_enc_sha256),
                        },
                        length=0,
                    )
                else:
                    value = await operation({}, resume=True)
                return _location(value, provider=True)

        try:
            return await asyncio.wait_for(run(), timeout=options.timeout or 30)
        except asyncio.TimeoutError:
            raise TimeoutError("Media upload timed out.", code="request_timeout") from None


async def _range(body: EncryptedUploadBody, start: int, length: int) -> AsyncGenerator[bytes, None]:
    source = body.open(start)
    remaining = length
    try:
        async for chunk in source:
            if len(chunk) > remaining:
                if start + length == body.info.encrypted_length:
                    raise MediaIntegrityError(
                        "Encrypted source exceeded its declared length.",
                        code="media_invalid_ciphertext",
                    )
                yield chunk[:remaining]
                return
            remaining -= len(chunk)
            if remaining == 0:
                if start + length == body.info.encrypted_length:
                    try:
                        await anext(source)
                    except StopAsyncIteration:
                        pass
                    else:
                        raise MediaIntegrityError(
                            "Encrypted source exceeded its declared length.",
                            code="media_invalid_ciphertext",
                        )
                yield chunk
                return
            yield chunk
        if remaining:
            raise MediaIntegrityError(
                "Encrypted source ended before its declared length.",
                code="media_invalid_ciphertext",
            )
    finally:
        await source.aclose()


class _SequentialParts:
    """Consecutive ranges share a pass; retries reopen at the declared offset."""

    def __init__(self, body: EncryptedUploadBody) -> None:
        self._body = body
        self._source: AsyncGenerator[bytes, None] | None = None
        self._position = 0
        self._pending = b""

    async def part(self, start: int, length: int) -> AsyncGenerator[bytes, None]:
        if self._source is None or self._position != start:
            await self.close()
            self._source = self._body.open(start)
            self._position = start
        source = self._source
        remaining = length
        while remaining:
            chunk, self._pending = self._pending, b""
            if not chunk:
                try:
                    chunk = await anext(source)
                except StopAsyncIteration:
                    raise MediaIntegrityError(
                        "Encrypted source ended before its declared length.",
                        code="media_invalid_ciphertext",
                    ) from None
            if len(chunk) > remaining:
                chunk, self._pending = chunk[:remaining], chunk[remaining:]
            remaining -= len(chunk)
            self._position += len(chunk)
            if remaining == 0 and self._position == self._body.info.encrypted_length:
                if self._pending:
                    raise MediaIntegrityError(
                        "Encrypted source exceeded its declared length.",
                        code="media_invalid_ciphertext",
                    )
                try:
                    await anext(source)
                except StopAsyncIteration:
                    pass
                else:
                    raise MediaIntegrityError(
                        "Encrypted source exceeded its declared length.",
                        code="media_invalid_ciphertext",
                    )
            yield chunk

    async def close(self) -> None:
        if self._source is not None:
            await self._source.aclose()
            self._source = None
        self._pending = b""


class WhatsAppMedia:
    def __init__(self, transport: Transport, credential: str = "organization_api_key") -> None:
        self._api = DirectMediaApi(transport)

    def transport(
        self,
        egress: Literal["relay", "direct"],
        *,
        http_transport: httpx.AsyncBaseTransport | None = None,
        max_attempts: int = 3,
        document_part_size: int = 50 * 1024 * 1024,
    ) -> MediaUploadTransport:
        if egress == "relay":
            return RelayUploadTransport(self._api)
        if egress != "direct":
            raise ConfigurationError("egress")
        return DirectUploadTransport(
            self._api,
            http_transport=http_transport,
            max_attempts=max_attempts,
            document_part_size=document_part_size,
        )

    async def upload(
        self,
        session: str,
        source: MediaSource,
        *,
        media_type: UploadMediaType,
        mimetype: str | None = None,
        egress: Literal["relay", "direct"] | MediaUploadTransport = "relay",
        max_bytes: int = MAX_BYTES,
        options: RequestOptions = DEFAULT_OPTIONS,
    ) -> MediaUploadResult:
        if not isinstance(session, str) or not session:
            raise ConfigurationError("session")
        selected = self.transport(egress) if isinstance(egress, str) else egress
        if not callable(getattr(selected, "upload", None)):
            raise ConfigurationError("egress")
        if isinstance(selected, DirectUploadTransport):
            self._api.require_direct()
            selected.require_direct()
        body = await prepare_whatsapp_upload(
            source, media_type=media_type, mimetype=mimetype, max_bytes=max_bytes
        )
        location = await selected.upload(session, body, options=options)
        info = body.info
        return MediaUploadResult(
            info.media_type,
            info.media_key,
            info.file_sha256,
            info.file_enc_sha256,
            info.file_length,
            info.encrypted_length,
            info.mimetype,
            location.direct_path,
            location.url,
            location.handle,
            selected.name,
        )


def to_whatsapp_media_send_descriptor(
    upload: MediaUploadResult,
    *,
    mimetype: str | None = None,
    thumbnail: bytes | None = None,
    width: int | None = None,
    height: int | None = None,
    seconds: int | None = None,
    waveform: bytes | None = None,
    media_key_timestamp: int | None = None,
    is_animated: bool | None = None,
) -> MediaSendDescriptor:
    mime = mimetype or upload.mimetype
    if not isinstance(mime, str) or re.fullmatch(r"[ -~]{1,255}", mime) is None:
        raise ConfigurationError("mimetype")
    if re.fullmatch(r"/(?!/)[!-~]{1,2047}", upload.direct_path) is None:
        raise ConfigurationError("direct_path")
    if not is_whatsapp_media_url(upload.url) or len(upload.url) > 2048:
        raise ConfigurationError("url")
    if isinstance(upload.file_length, bool) or not 1 <= upload.file_length <= 2**31:
        raise ConfigurationError("file_length")
    for name, value in (
        ("media_key", upload.media_key),
        ("file_sha256", upload.file_sha256),
        ("file_enc_sha256", upload.file_enc_sha256),
    ):
        if not isinstance(value, bytes) or len(value) != 32:
            raise ConfigurationError(name)
    if (width is None) != (height is None):
        raise ConfigurationError("width")
    for name, dimension, lower, upper in (
        ("width", width, 1, 65536),
        ("height", height, 1, 65536),
        ("seconds", seconds, 0, 86400),
        ("media_key_timestamp", media_key_timestamp, 1, 2**40),
    ):
        if dimension is not None and (
            isinstance(dimension, bool)
            or not isinstance(dimension, int)
            or not lower <= dimension <= upper
        ):
            raise ConfigurationError(name)
    if thumbnail is not None and (not isinstance(thumbnail, bytes) or len(thumbnail) > 16384):
        raise ConfigurationError("thumbnail")
    if waveform is not None and (not isinstance(waveform, bytes) or not 64 <= len(waveform) <= 192):
        raise ConfigurationError("waveform")
    if is_animated is not None and (
        not isinstance(is_animated, bool) or upload.media_type != "sticker"
    ):
        raise ConfigurationError("is_animated")
    if upload.media_type == "sticker" and (
        mime != "image/webp" or thumbnail is not None or seconds is not None or waveform is not None
    ):
        raise ConfigurationError("media_type")
    result: MediaSendDescriptor = {
        "directPath": upload.direct_path,
        "url": upload.url,
        "mimeType": mime,
        "fileLength": upload.file_length,
        "mediaKey": base64.b64encode(upload.media_key).decode(),
        "fileSha256": base64.b64encode(upload.file_sha256).decode(),
        "fileEncSha256": base64.b64encode(upload.file_enc_sha256).decode(),
    }
    if width is not None and height is not None:
        result["width"], result["height"] = width, height
    if seconds is not None:
        result["seconds"] = seconds
    if media_key_timestamp is not None:
        result["mediaKeyTimestamp"] = media_key_timestamp
    if is_animated is not None:
        result["isAnimated"] = is_animated
    if thumbnail is not None:
        result["thumbnail"] = base64.b64encode(thumbnail).decode()
    if waveform is not None:
        result["waveform"] = base64.b64encode(waveform).decode()
    return result


def validate_sticker_content(value: object) -> None:
    """Apply descriptor-builder checks to hand-authored sticker mappings."""
    v = V.fields(value, ["descriptor"], ["descriptor"], "sticker")
    required = [
        "directPath",
        "mediaKey",
        "fileSha256",
        "fileEncSha256",
        "fileLength",
        "mimeType",
        "url",
    ]
    d = V.fields(
        v["descriptor"],
        required + ["width", "height", "mediaKeyTimestamp", "isAnimated"],
        required,
        "sticker.descriptor",
    )

    def binary(key: str) -> bytes:
        text = d[key]
        if not isinstance(text, str) or re.fullmatch(r"[A-Za-z0-9+/]{43}=", text) is None:
            raise ConfigurationError(key)
        return base64.b64decode(text, validate=True)

    # Membership checks retain explicit null refusal, false and zero.
    for key, low, high in (
        ("width", 1, 65536),
        ("height", 1, 65536),
        ("mediaKeyTimestamp", 1, 2**40),
    ):
        if key in d:
            V.integer(d[key], key, low, high)
    if "isAnimated" in d and type(d["isAnimated"]) is not bool:
        raise ConfigurationError("isAnimated")
    to_whatsapp_media_send_descriptor(
        MediaUploadResult(
            "sticker",
            binary("mediaKey"),
            binary("fileSha256"),
            binary("fileEncSha256"),
            V.integer(d["fileLength"], "fileLength", 1, 2**31),
            0,
            V.text(d["mimeType"], "mimeType"),
            V.text(d["directPath"], "directPath"),
            V.text(d["url"], "url"),
        ),
        width=cast(int | None, d.get("width")),
        height=cast(int | None, d.get("height")),
        media_key_timestamp=cast(int | None, d.get("mediaKeyTimestamp")),
        is_animated=cast(bool | None, d.get("isAnimated")),
    )
