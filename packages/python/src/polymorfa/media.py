"""Verified buffered WhatsApp media download.

Reference: Cellar whatsapp-1049950004 WAWebCryptoCreateMediaKeys.js:23-29,
WAWebCryptoMediaTypeInfo.js:4-12, WAWebCryptoDecryptMedia.js:19,28-60.
The pinned TS implementation defines descriptor fields and bounded download semantics.
"""

from __future__ import annotations

import base64
import hashlib
import hmac
from dataclasses import dataclass, field
from typing import Literal, cast
from urllib.parse import urlencode, urljoin, urlsplit

import httpx
from cryptography.hazmat.primitives import hashes, padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

from .errors import ConfigurationError, ConnectionError, MediaIntegrityError

MediaKind = Literal["image", "video", "audio", "document", "sticker"]
MAX_BYTES = 256 * 1024 * 1024
_FIELDS = {
    "image": {
        1: "url",
        2: "mimetype",
        4: "file_sha256",
        5: "file_length",
        8: "media_key",
        9: "file_enc_sha256",
        11: "direct_path",
    },
    "video": {
        1: "url",
        2: "mimetype",
        3: "file_sha256",
        4: "file_length",
        6: "media_key",
        11: "file_enc_sha256",
        13: "direct_path",
    },
    "audio": {
        1: "url",
        2: "mimetype",
        3: "file_sha256",
        4: "file_length",
        7: "media_key",
        8: "file_enc_sha256",
        9: "direct_path",
    },
    "document": {
        1: "url",
        2: "mimetype",
        4: "file_sha256",
        5: "file_length",
        7: "media_key",
        8: "file_name",
        9: "file_enc_sha256",
        10: "direct_path",
    },
    "sticker": {
        1: "url",
        2: "file_sha256",
        3: "file_enc_sha256",
        4: "media_key",
        5: "mimetype",
        8: "direct_path",
        9: "file_length",
    },
}


@dataclass(frozen=True)
class MediaDescriptor:
    media_kind: MediaKind
    media_key: bytes = field(repr=False)
    url: str | None = field(default=None, repr=False)
    direct_path: str | None = field(default=None, repr=False)
    file_sha256: bytes | None = field(default=None, repr=False)
    file_enc_sha256: bytes | None = field(default=None, repr=False)
    file_length: int | None = None
    mimetype: str | None = None
    file_name: str | None = None

    def __post_init__(self) -> None:
        if self.media_kind not in _FIELDS or len(self.media_key) != 32:
            raise MediaIntegrityError("Invalid media descriptor.", code="media_invalid_descriptor")
        for digest in (self.file_sha256, self.file_enc_sha256):
            if digest is not None and len(digest) != 32:
                raise MediaIntegrityError(
                    "Invalid descriptor hash.", code="media_invalid_descriptor"
                )
        if self.file_length is not None and (
            isinstance(self.file_length, bool) or self.file_length < 0
        ):
            raise MediaIntegrityError("Invalid descriptor length.", code="media_invalid_descriptor")


def decode_whatsapp_media(encoded: str, media_kind: MediaKind) -> MediaDescriptor:
    if media_kind not in _FIELDS or not encoded or len(encoded) > 1024 * 1024:
        raise MediaIntegrityError("Invalid media descriptor.", code="media_invalid_descriptor")
    try:
        raw = base64.b64decode(encoded + "=" * (-len(encoded) % 4), altchars=b"-_", validate=True)
        offset = 0

        def varint() -> int:
            nonlocal offset
            result = 0
            for shift in range(0, 70, 7):
                if offset >= len(raw):
                    raise ValueError
                byte = raw[offset]
                offset += 1
                result |= (byte & 127) << shift
                if not byte & 128:
                    return result
            raise ValueError

        values: dict[str, object] = {}
        while offset < len(raw):
            tag = varint()
            number, wire = tag >> 3, tag & 7
            if number == 0:
                raise ValueError
            name = _FIELDS[media_kind].get(number)
            if wire == 0:
                value: object = varint()
            elif wire in (1, 2, 5):
                size = varint() if wire == 2 else 8 if wire == 1 else 4
                if size > len(raw) - offset:
                    raise ValueError
                value = raw[offset : offset + size]
                offset += size
            else:
                raise ValueError
            if name is None:
                continue
            if name == "file_length":
                if wire != 0 or not isinstance(value, int) or value > 2**53 - 1:
                    raise ValueError
            elif name in ("media_key", "file_sha256", "file_enc_sha256"):
                if wire != 2 or not isinstance(value, bytes) or len(value) != 32:
                    raise ValueError
            else:
                if (
                    wire != 2
                    or not isinstance(value, bytes)
                    or len(value)
                    > (
                        8192
                        if name in ("url", "direct_path")
                        else 255
                        if name == "mimetype"
                        else 4096
                    )
                ):
                    raise ValueError
                value = value.decode("utf-8", errors="strict")
            values[name] = value
        return MediaDescriptor(
            media_kind,
            cast(bytes, values["media_key"]),
            cast(str | None, values.get("url")),
            cast(str | None, values.get("direct_path")),
            cast(bytes | None, values.get("file_sha256")),
            cast(bytes | None, values.get("file_enc_sha256")),
            cast(int | None, values.get("file_length")),
            cast(str | None, values.get("mimetype")),
            cast(str | None, values.get("file_name")),
        )
    except (ValueError, KeyError, UnicodeDecodeError):
        raise MediaIntegrityError(
            "Invalid media descriptor.", code="media_invalid_descriptor"
        ) from None


def derive_whatsapp_media_keys(
    media_key: bytes, media_kind: MediaKind
) -> tuple[bytes, bytes, bytes]:
    if len(media_key) != 32 or media_kind not in _FIELDS:
        raise MediaIntegrityError("Invalid media key.", code="media_invalid_descriptor")
    kind = "image" if media_kind == "sticker" else media_kind
    material = HKDF(
        algorithm=hashes.SHA256(),
        length=112,
        salt=b"",
        info=f"WhatsApp {kind.title()} Keys".encode(),
    ).derive(media_key)
    return material[:16], material[16:48], material[48:80]


def decrypt_whatsapp_media(
    data: bytes, descriptor: MediaDescriptor, *, max_bytes: int = MAX_BYTES
) -> bytes:
    if isinstance(max_bytes, bool) or max_bytes <= 0:
        raise ConfigurationError("max_bytes")
    if descriptor.file_length is not None and descriptor.file_length > max_bytes:
        raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
    limit = min(
        max_bytes, descriptor.file_length if descriptor.file_length is not None else max_bytes
    )
    if len(data) > (limit // 16 + 1) * 16 + 10:
        raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
    if len(data) <= 10:
        raise MediaIntegrityError("Encrypted media is too short.", code="media_too_short")
    if descriptor.file_enc_sha256 is not None and not hmac.compare_digest(
        hashlib.sha256(data).digest(), descriptor.file_enc_sha256
    ):
        raise MediaIntegrityError("Encrypted hash mismatch.", code="media_enc_hash_mismatch")
    iv, key, mac_key = derive_whatsapp_media_keys(descriptor.media_key, descriptor.media_kind)
    ciphertext, mac = data[:-10], data[-10:]
    expected = hmac.new(mac_key, iv + ciphertext, hashlib.sha256).digest()[:10]
    if not hmac.compare_digest(mac, expected):
        raise MediaIntegrityError("Media MAC mismatch.", code="media_mac_mismatch")
    if not ciphertext or len(ciphertext) % 16:
        raise MediaIntegrityError("Invalid ciphertext blocks.", code="media_invalid_ciphertext")
    try:
        decryptor = Cipher(algorithms.AES(key), modes.CBC(iv)).decryptor()
        padded = decryptor.update(ciphertext) + decryptor.finalize()
        unpadder = padding.PKCS7(128).unpadder()
        plaintext = unpadder.update(padded) + unpadder.finalize()
    except ValueError:
        raise MediaIntegrityError("Invalid media padding.", code="media_invalid_padding") from None
    if len(plaintext) > max_bytes:
        raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
    if descriptor.file_sha256 is not None and not hmac.compare_digest(
        hashlib.sha256(plaintext).digest(), descriptor.file_sha256
    ):
        raise MediaIntegrityError("Plaintext hash mismatch.", code="media_hash_mismatch")
    return plaintext


def is_whatsapp_media_url(url: str) -> bool:
    try:
        parsed = urlsplit(url)
        host = parsed.hostname
        return (
            parsed.scheme == "https"
            and not parsed.username
            and not parsed.password
            and parsed.port in (None, 443)
            and host is not None
            and (host == "whatsapp.net" or host.endswith(".whatsapp.net"))
        )
    except ValueError:
        return False


def whatsapp_media_urls(descriptor: MediaDescriptor) -> tuple[str, ...]:
    urls = []
    if descriptor.url:
        if not is_whatsapp_media_url(descriptor.url):
            raise MediaIntegrityError("Invalid WhatsApp CDN URL.", code="media_invalid_descriptor")
        urls.append(descriptor.url)
    if descriptor.direct_path:
        path = descriptor.direct_path
        if not path.startswith("/") or path.startswith("//") or "\\" in path:
            raise MediaIntegrityError("Invalid media direct path.", code="media_invalid_descriptor")
        digest = base64.urlsafe_b64encode(descriptor.file_enc_sha256 or b"").rstrip(b"=").decode()
        kind = {
            "image": "image",
            "video": "video",
            "audio": "audio",
            "document": "document",
            "sticker": "image",
        }[descriptor.media_kind]
        url = (
            "https://mmg.whatsapp.net"
            + path
            + ("&" if "?" in path else "?")
            + urlencode({"hash": digest, "mms-type": kind, "__wa-mms": ""})
        )
        if not is_whatsapp_media_url(url):
            raise MediaIntegrityError("Invalid media direct path.", code="media_invalid_descriptor")
        if url not in urls:
            urls.append(url)
    if not urls:
        raise MediaIntegrityError("Missing media location.", code="media_invalid_descriptor")
    return tuple(urls)


async def download_whatsapp_media(
    descriptor: MediaDescriptor,
    *,
    max_bytes: int = MAX_BYTES,
    http_transport: httpx.AsyncBaseTransport | None = None,
) -> bytes:
    if isinstance(max_bytes, bool) or max_bytes <= 0:
        raise ConfigurationError("max_bytes")
    if descriptor.file_length is not None and descriptor.file_length > max_bytes:
        raise MediaIntegrityError("Media exceeds size limit.", code="media_too_large")
    if descriptor.file_sha256 is None:
        raise MediaIntegrityError("Missing media plaintext hash.", code="media_invalid_descriptor")
    urls = whatsapp_media_urls(descriptor)
    limit = min(
        max_bytes, descriptor.file_length if descriptor.file_length is not None else max_bytes
    )
    encrypted_limit = (limit // 16 + 1) * 16 + 10
    try:
        async with httpx.AsyncClient(
            transport=http_transport, trust_env=False, follow_redirects=False
        ) as client:
            for index, url in enumerate(urls):
                current = url
                for hop in range(4):
                    async with client.stream(
                        "GET",
                        current,
                        headers={
                            "Origin": "https://web.whatsapp.com",
                            "Referer": "https://web.whatsapp.com/",
                        },
                    ) as response:
                        if response.status_code in (301, 302, 303, 307, 308):
                            location = response.headers.get("location")
                            next_url = urljoin(current, location) if location else ""
                            if not is_whatsapp_media_url(next_url):
                                raise MediaIntegrityError(
                                    "Invalid media redirect.", code="media_invalid_descriptor"
                                )
                            current = next_url
                            if hop == 3:
                                raise ConnectionError(
                                    "Too many media redirects.", code="connection_error"
                                )
                            continue
                        if response.status_code != 200:
                            if index + 1 < len(urls):
                                break
                            raise ConnectionError(
                                "WhatsApp media download failed.",
                                code="connection_error",
                                status=response.status_code,
                            )
                        data = bytearray()
                        async for chunk in response.aiter_bytes():
                            if len(data) + len(chunk) > encrypted_limit:
                                raise MediaIntegrityError(
                                    "Media exceeds size limit.", code="media_too_large"
                                )
                            data.extend(chunk)
                        return decrypt_whatsapp_media(bytes(data), descriptor, max_bytes=max_bytes)
    except httpx.TransportError:
        raise ConnectionError("WhatsApp media download failed.", code="connection_error") from None
    raise ConnectionError("WhatsApp media download failed.", code="connection_error")
