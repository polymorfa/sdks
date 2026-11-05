"""Bounded incremental WhatsApp decryption and single-use verified downloads."""

from __future__ import annotations

import hashlib
import hmac
import math
from collections.abc import AsyncIterable, AsyncIterator
from typing import Literal, cast
from urllib.parse import urljoin

import httpx
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from typing_extensions import NotRequired, Self, TypedDict

from .errors import ConfigurationError, ConnectionError, MediaIntegrityError, TimeoutError
from .media import (
    MAX_BYTES,
    MediaDescriptor,
    MediaKind,
    decode_whatsapp_media,
    derive_whatsapp_media_keys,
    is_whatsapp_media_url,
    whatsapp_media_urls,
)

VerifyMode = Literal["before-release", "streaming"]


class WhatsAppMediaMessage(TypedDict):
    type: str
    media: NotRequired[str]


MediaInput = MediaDescriptor | WhatsAppMediaMessage


def descriptor_from_media(value: MediaInput) -> MediaDescriptor:
    if isinstance(value, MediaDescriptor):
        return value
    media = value.get("media")
    kind = value.get("type")
    if not isinstance(media, str) or kind not in ("image", "audio", "video", "document", "sticker"):
        raise MediaIntegrityError(
            "The message has no encrypted media descriptor.", code="media_invalid_descriptor"
        )
    return decode_whatsapp_media(media, cast(MediaKind, kind))


def _limit(descriptor: MediaDescriptor, max_bytes: int) -> int:
    if (
        isinstance(max_bytes, bool)
        or not isinstance(max_bytes, int)
        or max_bytes <= 0
        or max_bytes > 2**53 - 1
    ):
        raise ConfigurationError("max_bytes")
    if descriptor.file_length is not None and descriptor.file_length > max_bytes:
        raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
    limit = min(
        max_bytes, descriptor.file_length if descriptor.file_length is not None else max_bytes
    )
    return (limit // 16 + 1) * 16 + 10


async def decrypt_whatsapp_media_stream(
    source: AsyncIterable[bytes],
    descriptor: MediaDescriptor,
    *,
    max_bytes: int = MAX_BYTES,
    verify: VerifyMode = "before-release",
) -> AsyncIterator[bytes]:
    encrypted_limit = _limit(descriptor, max_bytes)
    if verify not in ("before-release", "streaming"):
        raise ConfigurationError("verify")
    iv, key, mac_key = derive_whatsapp_media_keys(descriptor.media_key, descriptor.media_kind)
    decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
    unpadder = padding.PKCS7(128).unpadder()
    encrypted_hash, plaintext_hash = hashlib.sha256(), hashlib.sha256()
    mac = hmac.new(mac_key, iv, hashlib.sha256)
    tail = bytearray()
    buffered: list[bytes] = []
    encrypted_bytes, plaintext_bytes, ciphertext_bytes = 0, 0, 0

    async for chunk in source:
        encrypted_bytes += len(chunk)
        if encrypted_bytes > encrypted_limit:
            raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
        encrypted_hash.update(chunk)
        tail.extend(chunk)
        if len(tail) <= 10:
            continue
        ciphertext = bytes(tail[:-10])
        del tail[:-10]
        ciphertext_bytes += len(ciphertext)
        mac.update(ciphertext)
        plaintext = unpadder.update(decryptor.update(ciphertext))
        plaintext_bytes += len(plaintext)
        if plaintext_bytes > max_bytes:
            raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
        plaintext_hash.update(plaintext)
        if plaintext:
            if verify == "streaming":
                yield plaintext
            else:
                buffered.append(plaintext)
    if encrypted_bytes <= 10:
        raise MediaIntegrityError("Encrypted media is too short.", code="media_too_short")
    if descriptor.file_enc_sha256 is not None and not hmac.compare_digest(
        encrypted_hash.digest(), descriptor.file_enc_sha256
    ):
        raise MediaIntegrityError("Encrypted hash mismatch.", code="media_enc_hash_mismatch")
    if not hmac.compare_digest(mac.digest()[:10], tail):
        raise MediaIntegrityError("Media MAC mismatch.", code="media_mac_mismatch")
    if not ciphertext_bytes or ciphertext_bytes % 16:
        raise MediaIntegrityError("Invalid ciphertext blocks.", code="media_invalid_ciphertext")
    try:
        final = unpadder.update(decryptor.finalize()) + unpadder.finalize()
    except ValueError:
        raise MediaIntegrityError("Invalid media padding.", code="media_invalid_padding") from None
    plaintext_bytes += len(final)
    if plaintext_bytes > max_bytes:
        raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
    plaintext_hash.update(final)
    if descriptor.file_sha256 is not None and not hmac.compare_digest(
        plaintext_hash.digest(), descriptor.file_sha256
    ):
        raise MediaIntegrityError("Plaintext hash mismatch.", code="media_hash_mismatch")
    if verify == "before-release":
        for plaintext in buffered:
            yield plaintext
    if final:
        yield final


class WhatsAppMediaDownload:
    def __init__(
        self,
        descriptor: MediaDescriptor,
        client: httpx.AsyncClient,
        response: httpx.Response,
        *,
        max_bytes: int,
        verify: VerifyMode,
    ) -> None:
        self.descriptor = descriptor
        self.media_kind, self.file_name, self.file_length = (
            descriptor.media_kind,
            descriptor.file_name,
            descriptor.file_length,
        )
        self.mimetype = (
            descriptor.mimetype
            or {
                "image": "image/jpeg",
                "video": "video/mp4",
                "audio": "audio/ogg",
                "document": "application/octet-stream",
                "sticker": "image/webp",
            }[descriptor.media_kind]
        )
        self.verify = verify
        self._client, self._response, self._max_bytes = client, response, max_bytes
        self._used = False
        self._closed = False

    async def _source(self) -> AsyncIterator[bytes]:
        try:
            async for chunk in self._response.aiter_bytes(chunk_size=65536):
                yield chunk
        except httpx.TimeoutException:
            raise TimeoutError("WhatsApp media body timed out.", code="request_timeout") from None
        except httpx.TransportError:
            raise ConnectionError(
                "WhatsApp media body could not be read.", code="connection_error"
            ) from None

    async def _iterate(self) -> AsyncIterator[bytes]:
        if self._used or self._closed:
            raise ConfigurationError("media_body_consumed")
        self._used = True
        try:
            async for chunk in decrypt_whatsapp_media_stream(
                self._source(), self.descriptor, max_bytes=self._max_bytes, verify=self.verify
            ):
                yield chunk
        finally:
            await self.close()

    def __aiter__(self) -> AsyncIterator[bytes]:
        return self._iterate()

    async def read(self) -> bytes:
        return b"".join([chunk async for chunk in self])

    async def close(self) -> None:
        if not self._closed:
            self._closed = True
            await self._response.aclose()
            await self._client.aclose()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()


async def download_whatsapp_media_stream(
    value: MediaInput,
    *,
    max_bytes: int = MAX_BYTES,
    verify: VerifyMode = "before-release",
    timeout: float = 30,
    http_transport: httpx.AsyncBaseTransport | None = None,
) -> WhatsAppMediaDownload:
    descriptor = descriptor_from_media(value)
    limit = _limit(descriptor, max_bytes)
    if (
        verify not in ("before-release", "streaming")
        or isinstance(timeout, bool)
        or not math.isfinite(timeout)
        or timeout <= 0
    ):
        raise ConfigurationError("media_download")
    if descriptor.file_sha256 is None:
        raise MediaIntegrityError("Missing media plaintext hash.", code="media_invalid_descriptor")
    urls = whatsapp_media_urls(descriptor)
    client = httpx.AsyncClient(
        transport=http_transport, timeout=timeout, trust_env=False, follow_redirects=False
    )
    failure: Exception = ConnectionError("WhatsApp media download failed.", code="connection_error")
    try:
        for url in urls:
            current = url
            try:
                for hop in range(4):
                    request = client.build_request(
                        "GET",
                        current,
                        headers={
                            "origin": "https://web.whatsapp.com",
                            "referer": "https://web.whatsapp.com/",
                        },
                    )
                    request.headers.pop("cookie", None)
                    response = await client.send(request, stream=True)
                    if response.status_code in (301, 302, 303, 307, 308):
                        location = response.headers.get("location")
                        await response.aclose()
                        current = urljoin(current, location) if location else ""
                        if not is_whatsapp_media_url(current):
                            raise MediaIntegrityError(
                                "Invalid media redirect.", code="media_invalid_descriptor"
                            )
                        if hop == 3:
                            raise ConnectionError(
                                "Too many media redirects.", code="connection_error"
                            )
                        continue
                    if not 200 <= response.status_code < 300:
                        failure = ConnectionError(
                            "WhatsApp media download failed.",
                            code="media_download_failed",
                            status=response.status_code,
                        )
                        await response.aclose()
                        break
                    length = response.headers.get("content-length")
                    if length is not None and length.isdecimal() and int(length) > limit:
                        await response.aclose()
                        raise MediaIntegrityError(
                            "Media exceeds size limit.", code="media_too_large"
                        )
                    return WhatsAppMediaDownload(
                        descriptor, client, response, max_bytes=max_bytes, verify=verify
                    )
            except httpx.TransportError:
                failure = ConnectionError(
                    "WhatsApp media host could not be reached.", code="connection_error"
                )
        raise failure
    except BaseException:
        await client.aclose()
        raise
