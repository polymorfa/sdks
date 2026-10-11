"""Single-use binary streams retain API metadata without storage credentials."""

from __future__ import annotations

import re
from collections.abc import AsyncIterator
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from urllib.parse import parse_qs, urlsplit

import httpx
from typing_extensions import Self

from .errors import ConnectionError, TimeoutError
from .transport import ResponseMetadata


@dataclass(frozen=True)
class DownloadUrl:
    streamed: bool
    url: str | None = field(default=None, repr=False)
    expires_at: datetime | None = None
    request_id: str | None = None


@dataclass(frozen=True)
class DownloadFile:
    data: bytes
    content_type: str
    filename: str | None
    request_id: str | None


class DownloadStream:
    def __init__(
        self, response: httpx.Response, metadata: ResponseMetadata, redirected: bool
    ) -> None:
        self._response = response
        self.metadata = metadata
        self.redirected = redirected
        self.content_type = response.headers.get("content-type")
        length = response.headers.get("content-length")
        self.content_length = int(length) if length and re.fullmatch(r"\d+", length) else None
        disposition = response.headers.get("content-disposition", "")
        match = re.search(
            r'filename="([^"\r\n]+)"|filename=([^;\r\n]+)', disposition, re.IGNORECASE
        )
        self.filename = (match.group(1) or match.group(2)).strip() if match else None
        self.request_id = metadata.request_id
        self._used = False

    async def _iterate(self) -> AsyncIterator[bytes]:
        if self._used:
            raise RuntimeError("Download body has already been consumed.")
        self._used = True
        try:
            async for chunk in self._response.aiter_bytes():
                yield chunk
        except httpx.TimeoutException:
            raise TimeoutError(
                "Download body timed out.", code="request_timeout", metadata=self.metadata
            ) from None
        except httpx.TransportError:
            raise ConnectionError(
                "Download body could not be read.", code="connection_error", metadata=self.metadata
            ) from None
        finally:
            await self.close()

    def __aiter__(self) -> AsyncIterator[bytes]:
        return self._iterate()

    async def read(self) -> bytes:
        return b"".join([chunk async for chunk in self])

    async def close(self) -> None:
        await self._response.aclose()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()


def signed_url_expiry(value: str) -> datetime | None:
    try:
        query = parse_qs(urlsplit(value).query)
        stamp = query.get("X-Amz-Date", [""])[0]
        seconds = query.get("X-Amz-Expires", [""])[0]
        if re.fullmatch(r"\d{8}T\d{6}Z", stamp) and re.fullmatch(r"\d+", seconds):
            return datetime.strptime(stamp, "%Y%m%dT%H%M%SZ").replace(
                tzinfo=timezone.utc
            ) + timedelta(seconds=int(seconds))
        epoch = query.get("Expires", [""])[0]
        if re.fullmatch(r"\d{9,11}", epoch):
            return datetime.fromtimestamp(int(epoch), timezone.utc)
    except (ValueError, OverflowError):
        pass
    return None
