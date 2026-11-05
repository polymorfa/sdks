"""Write streamed media to a private sibling file and publish only after success."""

from __future__ import annotations

import os
import secrets
from collections.abc import AsyncIterable
from dataclasses import dataclass
from pathlib import Path
from typing import Protocol, runtime_checkable

import httpx

from .downloads import DownloadStream
from .errors import ConfigurationError, ConflictError, MediaIntegrityError
from .media import MAX_BYTES
from .media_streams import MediaInput, VerifyMode, download_whatsapp_media_stream
from .transport import DEFAULT_OPTIONS, RequestOptions


@dataclass(frozen=True)
class WrittenFile:
    path: str
    bytes: int
    content_type: str | None = None
    filename: str | None = None
    request_id: str | None = None


class MediaDownloader(Protocol):
    async def download_stream(
        self, media_id: str, *, options: RequestOptions = DEFAULT_OPTIONS
    ) -> DownloadStream: ...


@runtime_checkable
class _Close(Protocol):
    async def close(self) -> None: ...


@runtime_checkable
class _GeneratorClose(Protocol):
    async def aclose(self) -> None: ...


async def write_stream_to_file(
    body: AsyncIterable[bytes],
    path: str | Path,
    *,
    overwrite: bool = True,
    max_bytes: int | None = None,
) -> WrittenFile:
    if max_bytes is not None and (
        isinstance(max_bytes, bool) or not isinstance(max_bytes, int) or max_bytes < 0
    ):
        raise ConfigurationError("max_bytes")
    target = Path(path)
    if not target.name:
        raise ConfigurationError("path")
    temporary = target.with_name("." + target.name + "." + secrets.token_hex(16) + ".partial")
    descriptor = os.open(temporary, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    total = 0
    completed = False
    try:
        with os.fdopen(descriptor, "wb") as file:
            async for chunk in body:
                total += len(chunk)
                if max_bytes is not None and total > max_bytes:
                    raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
                file.write(chunk)
            file.flush()
            os.fsync(file.fileno())
        if overwrite:
            os.replace(temporary, target)
        else:
            try:
                os.link(temporary, target)
            except FileExistsError:
                raise ConflictError(
                    "Destination file already exists.", code="file_exists"
                ) from None
            temporary.unlink()
        completed = True
        return WrittenFile(str(target), total)
    finally:
        temporary.unlink(missing_ok=True)
        if not completed:
            if isinstance(body, _Close):
                await body.close()
            elif isinstance(body, _GeneratorClose):
                await body.aclose()


async def download_media_to_file(
    media: MediaDownloader,
    media_id: str,
    path: str | Path,
    *,
    overwrite: bool = True,
    max_bytes: int | None = None,
    options: RequestOptions = DEFAULT_OPTIONS,
) -> WrittenFile:
    if not overwrite and Path(path).exists():
        raise ConflictError("Destination file already exists.", code="file_exists")
    download = await media.download_stream(media_id, options=options)
    try:
        if (
            max_bytes is not None
            and download.content_length is not None
            and download.content_length > max_bytes
        ):
            raise MediaIntegrityError(
                "Media exceeds size limit.", code="media_too_large", metadata=download.metadata
            )
        written = await write_stream_to_file(
            download, path, overwrite=overwrite, max_bytes=max_bytes
        )
        return WrittenFile(
            written.path,
            written.bytes,
            download.content_type,
            download.filename,
            download.request_id,
        )
    finally:
        await download.close()


async def download_whatsapp_media_to_file(
    value: MediaInput,
    path: str | Path,
    *,
    overwrite: bool = True,
    max_bytes: int = MAX_BYTES,
    verify: VerifyMode = "streaming",
    timeout: float = 30,
    http_transport: httpx.AsyncBaseTransport | None = None,
) -> WrittenFile:
    if not overwrite and Path(path).exists():
        raise ConflictError("Destination file already exists.", code="file_exists")
    async with await download_whatsapp_media_stream(
        value, max_bytes=max_bytes, verify=verify, timeout=timeout, http_transport=http_transport
    ) as download:
        written = await write_stream_to_file(
            download, path, overwrite=overwrite, max_bytes=max_bytes
        )
        return WrittenFile(written.path, written.bytes, download.mimetype, download.file_name)
