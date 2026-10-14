"""Customer-owned async S3/R2/MinIO media store; source SDK 254fc6a.

The supplied client is application-owned (for example an aioboto3 S3 client).
Verified private spools prevent a bad download from replacing a valid object.
"""

from __future__ import annotations

import asyncio
import tempfile
from collections.abc import AsyncGenerator, Mapping
from dataclasses import dataclass
from pathlib import Path
from typing import Literal, Protocol, cast
from urllib.parse import quote

import httpx

from .direct_media import MediaUploadResult, MediaUploadTransport, WhatsAppMedia
from .errors import ConfigurationError, MediaIntegrityError
from .files import download_whatsapp_media_to_file
from .media import MAX_BYTES
from .media_encrypt import UploadMediaType
from .media_streams import MediaInput, descriptor_from_media
from .transport import DEFAULT_OPTIONS, RequestOptions


class S3Body(Protocol):
    async def read(self, amount: int = -1) -> bytes: ...
    def close(self) -> None: ...


class AsyncS3Client(Protocol):
    async def head_object(self, **kwargs: object) -> Mapping[str, object]: ...
    async def get_object(self, **kwargs: object) -> Mapping[str, object]: ...
    async def put_object(self, **kwargs: object) -> Mapping[str, object]: ...


@dataclass(frozen=True)
class S3ArchiveResult:
    bucket: str
    key: str
    bytes: int
    mimetype: str
    etag: str | None = None


class S3MediaStore:
    def __init__(self, client: AsyncS3Client, bucket: str, *, prefix: str = "") -> None:
        if not isinstance(bucket, str) or not bucket or not isinstance(prefix, str):
            raise ConfigurationError("bucket")
        self._client, self._bucket, self._prefix = client, bucket, prefix

    def _key(self, key: str) -> str:
        if not isinstance(key, str) or not key:
            raise ConfigurationError("key")
        return self._prefix + key

    async def upload_to_whatsapp(
        self,
        messaging: WhatsAppMedia,
        session: str,
        key: str,
        *,
        media_type: UploadMediaType,
        mimetype: str | None = None,
        egress: MediaUploadTransport | str = "relay",
        max_bytes: int = MAX_BYTES,
        options: RequestOptions = DEFAULT_OPTIONS,
    ) -> MediaUploadResult:
        object_key = self._key(key)
        head = await self._client.head_object(Bucket=self._bucket, Key=object_key)
        etag = head.get("ETag")
        if not isinstance(etag, str) or not etag:
            raise ConfigurationError("object_etag")

        async def source() -> AsyncGenerator[bytes, None]:
            response = await self._client.get_object(
                Bucket=self._bucket, Key=object_key, IfMatch=etag
            )
            raw = response.get("Body")
            if raw is None or not callable(getattr(raw, "read", None)):
                raise ConfigurationError("object_body")
            body = cast(S3Body, raw)
            try:
                while True:
                    chunk = await body.read(64 * 1024)
                    if not chunk:
                        break
                    yield chunk
            finally:
                body.close()

        mime = mimetype or head.get("ContentType")
        if mime is not None and not isinstance(mime, str):
            raise ConfigurationError("mimetype")
        if isinstance(egress, str) and egress not in ("relay", "direct"):
            raise ConfigurationError("egress")
        return await messaging.upload(
            session,
            source,
            media_type=media_type,
            mimetype=mime,
            egress=cast(Literal["relay", "direct"] | MediaUploadTransport, egress),
            max_bytes=max_bytes,
            options=options,
        )

    async def archive(
        self,
        value: MediaInput,
        key: str,
        *,
        metadata: Mapping[str, str] | None = None,
        scratch_directory: str | Path,
        max_bytes: int = MAX_BYTES,
        timeout: float = 30,
        http_transport: httpx.AsyncBaseTransport | None = None,
    ) -> S3ArchiveResult:
        object_key = self._key(key)
        descriptor = descriptor_from_media(value)
        # The caller selects durable scratch storage; no system-temp fallback.
        scratch = Path(scratch_directory)
        if not scratch.is_dir():
            raise ConfigurationError("scratch_directory")
        extra = dict(metadata or {})
        if any(
            not isinstance(name, str)
            or not isinstance(content, str)
            or not name.isascii()
            or not content.isascii()
            for name, content in extra.items()
        ):
            raise ConfigurationError("metadata")
        if any(
            name.lower().replace("-", "").replace("_", "")
            in {"mediakey", "descriptor", "authorization"}
            for name in extra
        ):
            raise ConfigurationError("metadata")
        with tempfile.TemporaryDirectory(prefix="polymorfa-media-", dir=scratch) as directory:
            written = await download_whatsapp_media_to_file(
                descriptor,
                Path(directory) / "verified",
                max_bytes=max_bytes,
                timeout=timeout,
                http_transport=http_transport,
            )
            if descriptor.file_length is not None and descriptor.file_length != written.bytes:
                raise MediaIntegrityError(
                    "Media length does not match the descriptor.", code="media_invalid_descriptor"
                )
            extra["wa-media-kind"] = descriptor.media_kind
            if descriptor.file_sha256 is not None:
                extra["wa-file-sha256"] = descriptor.file_sha256.hex()
            if written.filename is not None:
                extra["wa-file-name"] = quote(written.filename, safe="")
            mime = written.content_type or "application/octet-stream"
            opening = asyncio.create_task(asyncio.to_thread(Path(written.path).open, "rb"))
            try:
                body = await asyncio.shield(opening)
            except asyncio.CancelledError:
                body = await opening
                body.close()
                raise
            try:
                response = await self._client.put_object(
                    Bucket=self._bucket,
                    Key=object_key,
                    Body=body,
                    ContentLength=written.bytes,
                    ContentType=mime,
                    Metadata=extra,
                )
            finally:
                body.close()
            etag = response.get("ETag")
            return S3ArchiveResult(
                self._bucket,
                object_key,
                written.bytes,
                mime,
                etag if isinstance(etag, str) else None,
            )
