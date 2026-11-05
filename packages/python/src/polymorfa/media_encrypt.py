"""Incremental WhatsApp media encryption; SDK source 254fc6a.

Cellar whatsapp-1049950004 modules/WAMediaCrypto.js:79-98 confirms AES-CBC,
HMAC(iv || ciphertext), mac10 and SHA256(ciphertext || mac10).
"""

from __future__ import annotations

import asyncio
import hashlib
import hmac
import inspect
import os
from collections.abc import AsyncGenerator, AsyncIterable, AsyncIterator, Awaitable, Callable
from dataclasses import dataclass, field, replace
from typing import Literal

from cryptography.hazmat.primitives import padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes

from .errors import ConfigurationError, MediaIntegrityError
from .media import MAX_BYTES, derive_whatsapp_media_keys

UploadMediaType = Literal["image", "video", "audio", "ptt", "document", "sticker"]
WHATSAPP_UPLOAD_MEDIA_TYPES: tuple[UploadMediaType, ...] = (
    "image",
    "video",
    "audio",
    "ptt",
    "document",
    "sticker",
)
MediaPlaintext = bytes | AsyncIterable[bytes]
MediaSource = MediaPlaintext | Callable[[], MediaPlaintext | Awaitable[MediaPlaintext]]


def positive_integer(value: int, name: str) -> int:
    if isinstance(value, bool) or not isinstance(value, int) or value < 1:
        raise ConfigurationError(name)
    return value


def whatsapp_encrypted_length(file_length: int) -> int:
    if isinstance(file_length, bool) or not isinstance(file_length, int) or file_length < 0:
        raise ConfigurationError("file_length")
    return (file_length // 16 + 1) * 16 + 10


def generate_whatsapp_media_key() -> bytes:
    return os.urandom(32)


@dataclass(frozen=True)
class EncryptedMediaInfo:
    media_type: UploadMediaType
    media_key: bytes = field(repr=False)
    file_sha256: bytes
    file_enc_sha256: bytes
    file_length: int
    encrypted_length: int
    mimetype: str | None = None


@dataclass(frozen=True)
class EncryptedMedia(EncryptedMediaInfo):
    ciphertext: bytes = field(default=b"", repr=False)


async def plaintext_chunks(source: MediaPlaintext) -> AsyncGenerator[bytes, None]:
    if isinstance(source, bytes):
        for offset in range(0, len(source), 64 * 1024):
            yield source[offset : offset + 64 * 1024]
        return
    if not isinstance(source, AsyncIterable):
        raise ConfigurationError("source")
    iterator = aiter(source)
    try:
        async for chunk in iterator:
            if not isinstance(chunk, bytes):
                raise ConfigurationError("source")
            # Bound cipher output even when a producer yields one large chunk.
            for offset in range(0, len(chunk), 64 * 1024):
                yield chunk[offset : offset + 64 * 1024]
    finally:
        close = getattr(iterator, "aclose", None)
        if close is not None:
            await close()


class EncryptedMediaStream:
    """Single-use ciphertext iterator. Await info only after consuming its body."""

    def __init__(
        self,
        source: MediaPlaintext,
        media_type: UploadMediaType,
        *,
        media_key: bytes | None = None,
        mimetype: str | None = None,
        max_bytes: int = MAX_BYTES,
    ) -> None:
        positive_integer(max_bytes, "max_bytes")
        if media_type not in WHATSAPP_UPLOAD_MEDIA_TYPES:
            raise ConfigurationError("media_type")
        key = generate_whatsapp_media_key() if media_key is None else media_key
        if not isinstance(key, bytes) or len(key) != 32:
            raise ConfigurationError("media_key")
        self.info: asyncio.Future[EncryptedMediaInfo] = asyncio.get_running_loop().create_future()
        self.info.add_done_callback(
            lambda result: None if result.cancelled() else result.exception()
        )
        self._source, self._type, self._key = source, media_type, key
        self._mimetype, self._limit, self._used = mimetype, max_bytes, False
        self._iterator: AsyncIterator[bytes] | None = None

    def __repr__(self) -> str:
        return f"EncryptedMediaStream(media_type={self._type!r})"

    def __aiter__(self) -> AsyncIterator[bytes]:
        if self._used:
            raise ConfigurationError("stream_already_consumed")
        self._used = True
        self._iterator = self._encrypt()
        return self._iterator

    async def _encrypt(self) -> AsyncIterator[bytes]:
        kind = "audio" if self._type == "ptt" else self._type
        iv, key, mac_key = derive_whatsapp_media_keys(self._key, kind)
        cipher = Cipher(algorithms.AES(key), modes.CBC(iv)).encryptor()
        padder = padding.PKCS7(128).padder()
        plain_hash, enc_hash = hashlib.sha256(), hashlib.sha256()
        mac = hmac.new(mac_key, iv, hashlib.sha256)
        plain_length, enc_length = 0, 0
        chunks = plaintext_chunks(self._source)
        try:
            async for chunk in chunks:
                plain_length += len(chunk)
                if plain_length > self._limit:
                    raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
                plain_hash.update(chunk)
                encrypted = cipher.update(padder.update(chunk))
                if encrypted:
                    mac.update(encrypted)
                    enc_hash.update(encrypted)
                    enc_length += len(encrypted)
                    yield encrypted
            final = cipher.update(padder.finalize()) + cipher.finalize()
            mac.update(final)
            tail = final + mac.digest()[:10]
            enc_hash.update(tail)
            enc_length += len(tail)
            self.info.set_result(
                EncryptedMediaInfo(
                    self._type,
                    self._key,
                    plain_hash.digest(),
                    enc_hash.digest(),
                    plain_length,
                    enc_length,
                    self._mimetype,
                )
            )
            yield tail
        except BaseException as error:
            if not self.info.done():
                if isinstance(error, (asyncio.CancelledError, GeneratorExit)):
                    self.info.cancel()
                else:
                    self.info.set_exception(error)
            raise
        finally:
            await chunks.aclose()

    async def aclose(self) -> None:
        if self._iterator is not None:
            close = getattr(self._iterator, "aclose", None)
            if close is not None:
                await close()
        if not self.info.done():
            self.info.cancel()


async def encrypt_whatsapp_media_stream(
    source: MediaPlaintext,
    *,
    media_type: UploadMediaType,
    media_key: bytes | None = None,
    mimetype: str | None = None,
    max_bytes: int = MAX_BYTES,
) -> EncryptedMediaStream:
    return EncryptedMediaStream(
        source, media_type, media_key=media_key, mimetype=mimetype, max_bytes=max_bytes
    )


async def encrypt_whatsapp_media(
    source: MediaPlaintext,
    *,
    media_type: UploadMediaType,
    media_key: bytes | None = None,
    mimetype: str | None = None,
    max_bytes: int = MAX_BYTES,
) -> EncryptedMedia:
    stream = await encrypt_whatsapp_media_stream(
        source,
        media_type=media_type,
        media_key=media_key,
        mimetype=mimetype,
        max_bytes=max_bytes,
    )
    try:
        ciphertext = b"".join([chunk async for chunk in stream])
        info = await stream.info
        return EncryptedMedia(
            info.media_type,
            info.media_key,
            info.file_sha256,
            info.file_enc_sha256,
            info.file_length,
            info.encrypted_length,
            info.mimetype,
            ciphertext,
        )
    finally:
        await stream.aclose()


@dataclass(frozen=True)
class EncryptedUploadBody:
    info: EncryptedMediaInfo
    _open: Callable[[], MediaPlaintext | Awaitable[MediaPlaintext]] = field(repr=False)
    max_bytes: int = MAX_BYTES
    ciphertext: bytes | None = field(default=None, repr=False)

    async def open(self, offset: int = 0) -> AsyncGenerator[bytes, None]:
        if (
            isinstance(offset, bool)
            or not isinstance(offset, int)
            or not 0 <= offset <= self.info.encrypted_length
        ):
            raise ConfigurationError("offset")
        if self.ciphertext is not None:
            async for chunk in plaintext_chunks(self.ciphertext[offset:]):
                yield chunk
            return
        source = self._open()
        if inspect.isawaitable(source):
            source = await source
        stream = await encrypt_whatsapp_media_stream(
            source,
            media_type=self.info.media_type,
            media_key=self.info.media_key,
            mimetype=self.info.mimetype,
            max_bytes=self.max_bytes,
        )
        remaining, pending = offset, b""
        try:
            async for chunk in stream:
                if remaining >= len(chunk):
                    remaining -= len(chunk)
                    continue
                chunk = chunk[remaining:]
                remaining = 0
                # Hold the final chunk until EOF verifies the second pass.
                if pending:
                    yield pending
                pending = chunk
            second = await stream.info
            if not hmac.compare_digest(second.file_enc_sha256, self.info.file_enc_sha256):
                raise MediaIntegrityError(
                    "Media source changed between upload passes.", code="media_enc_hash_mismatch"
                )
            if pending:
                yield pending
        finally:
            await stream.aclose()


async def prepare_whatsapp_upload(
    source: MediaSource,
    *,
    media_type: UploadMediaType,
    mimetype: str | None = None,
    max_bytes: int = MAX_BYTES,
) -> EncryptedUploadBody:
    if callable(source):
        first = source()
        if inspect.isawaitable(first):
            first = await first
        stream = await encrypt_whatsapp_media_stream(
            first, media_type=media_type, mimetype=mimetype, max_bytes=max_bytes
        )
        try:
            async for _ in stream:
                pass
            info = await stream.info
        finally:
            await stream.aclose()
        return EncryptedUploadBody(info, source, max_bytes)
    encrypted = await encrypt_whatsapp_media(
        source, media_type=media_type, mimetype=mimetype, max_bytes=max_bytes
    )
    return EncryptedUploadBody(
        replace(encrypted, ciphertext=b""), lambda: source, max_bytes, encrypted.ciphertext
    )
