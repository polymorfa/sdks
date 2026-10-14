"""Verified local history decode using the same pinned protocol as TypeScript.

Cellar whatsapp-1049950004 modules/WAMediaHkdfInfo.js:14 selects History keys;
modules/WAWebHandleHistorySyncChunk.js:134-136 inflates before protobuf decoding.
SDK source 254fc6a; generated wire-schema provenance is history_proto/source.json.
"""

from __future__ import annotations

import asyncio
import base64
import hashlib
import hmac
import re
import zlib
from dataclasses import dataclass, field
from typing import cast
from urllib.parse import urlencode, urljoin

import httpx
from cryptography.hazmat.primitives import hashes, padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .errors import ConfigurationError, ConnectionError, MediaIntegrityError, TimeoutError
from .media import MAX_BYTES, is_whatsapp_media_url
from .media_encrypt import positive_integer, whatsapp_encrypted_length
from .transport import JsonObject

try:
    from google.protobuf.json_format import MessageToDict
    from google.protobuf.message import DecodeError

    from .history_proto.whatsapp_pb2 import Conversation, HistorySync, Pushname, WebMessageInfo
except ImportError:
    raise ConfigurationError("history_extra_requires_protobuf") from None

DEFAULT_HISTORY_SYNC_MAX_INFLATED_BYTES = 512 * 1024 * 1024
HistorySyncChunk = HistorySync


@dataclass(frozen=True)
class HistoryChunkDescriptor:
    direct_path: str = field(repr=False)
    media_key: bytes | str = field(repr=False)
    file_sha256: bytes | str = field(repr=False)
    file_enc_sha256: bytes | str = field(repr=False)
    file_length: int | None = None


@dataclass(frozen=True)
class HistoryInlinePayload:
    inline_payload: bytes | str = field(repr=False)


HistoryChunkInput = HistoryChunkDescriptor | HistoryInlinePayload


def bytes_field(
    value: bytes | str, name: str, *, length: int | None = None, max_bytes: int = MAX_BYTES
) -> bytes:
    if isinstance(value, bytes):
        result = value
    elif isinstance(value, str) and value:
        if len(value) > ((max_bytes + 2) // 3) * 4:
            raise MediaIntegrityError("History payload exceeds size limit.", code="media_too_large")
        normalized = value.replace("-", "+").replace("_", "/")
        if re.fullmatch(r"[A-Za-z0-9+/]*={0,2}", normalized) is None:
            raise MediaIntegrityError(f"Invalid history {name}.", code="media_invalid_descriptor")
        try:
            result = base64.b64decode(normalized + "=" * ((-len(normalized)) % 4), validate=True)
        except ValueError:
            raise MediaIntegrityError(
                f"Invalid history {name}.", code="media_invalid_descriptor"
            ) from None
    else:
        raise MediaIntegrityError(f"Invalid history {name}.", code="media_invalid_descriptor")
    if len(result) > max_bytes:
        raise MediaIntegrityError("History payload exceeds size limit.", code="media_too_large")
    if length is not None and len(result) != length:
        raise MediaIntegrityError(
            f"Invalid history {name} length.", code="media_invalid_descriptor"
        )
    return result


def decode_history_sync_payload(
    payload: bytes | str,
    *,
    max_inflated_bytes: int = DEFAULT_HISTORY_SYNC_MAX_INFLATED_BYTES,
    max_bytes: int = MAX_BYTES,
) -> HistorySync:
    positive_integer(max_inflated_bytes, "max_inflated_bytes")
    positive_integer(max_bytes, "max_bytes")
    compressed = bytes_field(payload, "payload", max_bytes=max_bytes)
    window = (
        31
        if compressed.startswith(b"\x1f\x8b")
        else 15
        if len(compressed) >= 2
        and compressed[0] & 15 == 8
        and int.from_bytes(compressed[:2], "big") % 31 == 0
        else -15
    )
    try:
        inflater = zlib.decompressobj(window)
        inflated = inflater.decompress(compressed, max_inflated_bytes + 1)
        if len(inflated) > max_inflated_bytes or inflater.unconsumed_tail:
            raise MediaIntegrityError(
                "Inflated history exceeds size limit.", code="media_too_large"
            )
        if not inflater.eof or inflater.unused_data:
            raise MediaIntegrityError(
                "Invalid compressed history.", code="media_invalid_ciphertext"
            )
    except zlib.error:
        raise MediaIntegrityError(
            "Invalid compressed history.", code="media_invalid_ciphertext"
        ) from None
    try:
        result = HistorySync()
        result.ParseFromString(inflated)
        if not result.IsInitialized():
            raise DecodeError("Missing required fields")
        return result
    except DecodeError:
        raise MediaIntegrityError(
            "Invalid history protobuf.", code="media_invalid_ciphertext"
        ) from None


def history_sync_to_dict(chunk: HistorySync) -> JsonObject:
    """Protobuf JSON field names, numeric enum values and lossless int64 strings."""
    return cast(
        JsonObject,
        MessageToDict(chunk, preserving_proto_field_name=True, use_integers_for_enums=True),
    )


def decrypt_history_chunk(
    data: bytes, descriptor: HistoryChunkDescriptor, *, max_bytes: int = MAX_BYTES
) -> bytes:
    positive_integer(max_bytes, "max_bytes")
    media_key = bytes_field(descriptor.media_key, "media_key", length=32, max_bytes=32)
    plain_hash = bytes_field(descriptor.file_sha256, "file_sha256", length=32, max_bytes=32)
    encrypted_hash = bytes_field(
        descriptor.file_enc_sha256, "file_enc_sha256", length=32, max_bytes=32
    )
    file_length = descriptor.file_length
    if file_length is not None and (
        isinstance(file_length, bool) or not isinstance(file_length, int) or file_length < 0
    ):
        raise MediaIntegrityError("Invalid history length.", code="media_invalid_descriptor")
    if (
        file_length is not None
        and file_length > max_bytes
        or len(data)
        > whatsapp_encrypted_length(
            min(max_bytes, file_length if file_length is not None else max_bytes)
        )
    ):
        raise MediaIntegrityError("History chunk exceeds size limit.", code="media_too_large")
    if len(data) <= 10 or (len(data) - 10) % 16:
        raise MediaIntegrityError(
            "Invalid encrypted history length.", code="media_invalid_ciphertext"
        )
    if not hmac.compare_digest(hashlib.sha256(data).digest(), encrypted_hash):
        raise MediaIntegrityError(
            "Encrypted history hash mismatch.", code="media_enc_hash_mismatch"
        )
    material = HKDF(
        algorithm=hashes.SHA256(), length=112, salt=b"", info=b"WhatsApp History Keys"
    ).derive(media_key)
    iv, key, mac_key = material[:16], material[16:48], material[48:80]
    ciphertext, mac = data[:-10], data[-10:]
    if not hmac.compare_digest(
        hmac.new(mac_key, iv + ciphertext, hashlib.sha256).digest()[:10], mac
    ):
        raise MediaIntegrityError("History MAC mismatch.", code="media_mac_mismatch")
    try:
        decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        plaintext = unpadder.update(padded) + unpadder.finalize()
    except ValueError:
        raise MediaIntegrityError(
            "Invalid history padding.", code="media_invalid_padding"
        ) from None
    if len(plaintext) > max_bytes:
        raise MediaIntegrityError("History chunk exceeds size limit.", code="media_too_large")
    if not hmac.compare_digest(hashlib.sha256(plaintext).digest(), plain_hash):
        raise MediaIntegrityError("History plaintext hash mismatch.", code="media_hash_mismatch")
    if file_length is not None and len(plaintext) != file_length:
        raise MediaIntegrityError("History length mismatch.", code="media_invalid_descriptor")
    return plaintext


async def download_history_chunk(
    descriptor: HistoryChunkInput,
    *,
    max_bytes: int = MAX_BYTES,
    max_inflated_bytes: int = DEFAULT_HISTORY_SYNC_MAX_INFLATED_BYTES,
    timeout: float = 30,
    http_transport: httpx.AsyncBaseTransport | None = None,
) -> HistorySync:
    positive_integer(max_bytes, "max_bytes")
    positive_integer(max_inflated_bytes, "max_inflated_bytes")
    if timeout <= 0 or not timeout < float("inf"):
        raise ConfigurationError("timeout")
    if isinstance(descriptor, HistoryInlinePayload):
        return decode_history_sync_payload(
            descriptor.inline_payload, max_bytes=max_bytes, max_inflated_bytes=max_inflated_bytes
        )
    if (
        not isinstance(descriptor, HistoryChunkDescriptor)
        or not isinstance(descriptor.direct_path, str)
        or re.fullmatch(r"/(?!/)[!-~]{1,8191}", descriptor.direct_path) is None
        or "\\" in descriptor.direct_path
    ):
        raise MediaIntegrityError("Invalid history direct path.", code="media_invalid_descriptor")
    if descriptor.file_length is not None:
        if (
            isinstance(descriptor.file_length, bool)
            or not isinstance(descriptor.file_length, int)
            or descriptor.file_length < 0
        ):
            raise MediaIntegrityError("Invalid history length.", code="media_invalid_descriptor")
        if descriptor.file_length > max_bytes:
            raise MediaIntegrityError("History chunk exceeds size limit.", code="media_too_large")
    digest = bytes_field(descriptor.file_enc_sha256, "file_enc_sha256", length=32, max_bytes=32)
    bytes_field(descriptor.media_key, "media_key", length=32, max_bytes=32)
    bytes_field(descriptor.file_sha256, "file_sha256", length=32, max_bytes=32)
    suffix = urlencode(
        {
            "hash": base64.urlsafe_b64encode(digest).rstrip(b"=").decode(),
            "mms-type": "md-msg-hist",
            "__wa-mms": "",
        }
    )
    initial_url = (
        "https://mmg.whatsapp.net"
        + descriptor.direct_path
        + ("&" if "?" in descriptor.direct_path else "?")
        + suffix
    )

    async def read() -> bytes:
        async with httpx.AsyncClient(
            transport=http_transport, trust_env=False, follow_redirects=False, timeout=timeout
        ) as client:
            url = initial_url
            for _ in range(6):
                if not is_whatsapp_media_url(url):
                    raise MediaIntegrityError(
                        "Invalid history CDN URL.", code="media_invalid_descriptor"
                    )
                async with client.stream("GET", url) as response:
                    if response.is_redirect:
                        location = response.headers.get("location", "")
                        if not location:
                            raise MediaIntegrityError(
                                "Invalid history CDN redirect.", code="media_invalid_descriptor"
                            )
                        url = urljoin(url, location)
                        continue
                    if not response.is_success:
                        raise MediaIntegrityError(
                            f"History download failed (HTTP {response.status_code}).",
                            code="media_download_failed",
                            status=response.status_code,
                        )
                    content = bytearray()
                    async for chunk in response.aiter_bytes():
                        if len(chunk) > whatsapp_encrypted_length(max_bytes) - len(content):
                            raise MediaIntegrityError(
                                "History chunk exceeds size limit.", code="media_too_large"
                            )
                        content.extend(chunk)
                    return bytes(content)
            raise MediaIntegrityError(
                "Too many history CDN redirects.", code="media_invalid_descriptor"
            )

    try:
        encrypted = await asyncio.wait_for(read(), timeout)
    except (asyncio.TimeoutError, httpx.TimeoutException):
        raise TimeoutError("History download timed out.", code="request_timeout") from None
    except httpx.TransportError:
        raise ConnectionError(
            "History CDN could not be reached.", code="connection_error"
        ) from None
    compressed = decrypt_history_chunk(encrypted, descriptor, max_bytes=max_bytes)
    return decode_history_sync_payload(
        compressed, max_bytes=max_bytes, max_inflated_bytes=max_inflated_bytes
    )


__all__ = [
    "DEFAULT_HISTORY_SYNC_MAX_INFLATED_BYTES",
    "Conversation",
    "HistoryChunkDescriptor",
    "HistoryChunkInput",
    "HistoryInlinePayload",
    "HistorySync",
    "HistorySyncChunk",
    "Pushname",
    "WebMessageInfo",
    "decode_history_sync_payload",
    "decrypt_history_chunk",
    "download_history_chunk",
    "history_sync_to_dict",
]
