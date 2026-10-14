import base64
import gzip
import hashlib
import hmac
import io
import zlib
from dataclasses import replace
from pathlib import Path

import httpx
import pytest
from cryptography.hazmat.primitives import hashes, padding
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives.kdf.hkdf import HKDF
from test_python_parity import run_mypy

from polymorfa import (
    AsyncMessagingClient,
    Credential,
    MediaDescriptor,
    MediaIntegrityError,
)
from polymorfa.history import (
    HistoryChunkDescriptor,
    HistoryInlinePayload,
    HistorySync,
    decode_history_sync_payload,
    decrypt_history_chunk,
    download_history_chunk,
    history_sync_to_dict,
)
from polymorfa.media_encrypt import encrypt_whatsapp_media
from polymorfa.s3 import S3MediaStore

KEY = Credential("organization_api_key", "pmfa_" + "a" * 72)


def compressed_history(format="zlib"):
    # FULL=2, plus unknown varint field2047=7. Unknown fields survive decoding.
    wire = b"\x08\x02\xf8\x7f\x07"
    if format == "gzip":
        return gzip.compress(wire)
    if format == "raw":
        compressor = zlib.compressobj(wbits=-15)
        return compressor.compress(wire) + compressor.flush()
    return zlib.compress(wire)


def encrypted_history(plaintext):
    key = bytes(range(32))
    material = HKDF(
        algorithm=hashes.SHA256(), length=112, salt=b"", info=b"WhatsApp History Keys"
    ).derive(key)
    iv, cipher_key, mac_key = material[:16], material[16:48], material[48:80]
    padder = padding.PKCS7(128).padder()
    padded = padder.update(plaintext) + padder.finalize()
    encryptor = Cipher(algorithms.AES(cipher_key), modes.CBC(iv)).encryptor()
    ciphertext = encryptor.update(padded) + encryptor.finalize()
    encrypted = ciphertext + hmac.new(mac_key, iv + ciphertext, hashlib.sha256).digest()[:10]
    return encrypted, HistoryChunkDescriptor(
        "/history/blob",
        key,
        hashlib.sha256(plaintext).digest(),
        hashlib.sha256(encrypted).digest(),
        len(plaintext),
    )


@pytest.mark.parametrize("format", ["zlib", "gzip", "raw"])
def test_history_wire_enum_and_unknown_fields_all_compression_formats(format):
    chunk = decode_history_sync_payload(compressed_history(format))
    assert (
        chunk.syncType == HistorySync.FULL and chunk.SerializeToString() == b"\x08\x02\xf8\x7f\x07"
    )
    assert history_sync_to_dict(chunk)["syncType"] == 2


def test_history_preserves_nested_messages_int64_and_media_bytes():
    chunk = HistorySync(syncType=HistorySync.FULL)
    conversation = chunk.conversations.add(id="chat", lastMsgTimestamp=9007199254740993)
    message = conversation.messages.add().message
    message.key.id = "message"
    message.message.imageMessage.mediaKey = bytes(range(32))
    parsed = decode_history_sync_payload(zlib.compress(chunk.SerializeToString()))
    assert parsed.conversations[0].lastMsgTimestamp == 9007199254740993
    assert parsed.conversations[0].messages[0].message.message.imageMessage.mediaKey == bytes(
        range(32)
    )
    assert (
        history_sync_to_dict(parsed)["conversations"][0]["lastMsgTimestamp"] == "9007199254740993"
    )


async def test_history_download_auth_free_verified_before_decode():
    encrypted, descriptor = encrypted_history(compressed_history())

    def handler(request):
        assert (
            request.url.host == "mmg.whatsapp.net"
            and request.url.params["mms-type"] == "md-msg-hist"
        )
        assert "authorization" not in request.headers and "cookie" not in request.headers
        return httpx.Response(200, content=encrypted)

    parsed = await download_history_chunk(descriptor, http_transport=httpx.MockTransport(handler))
    assert parsed.syncType == 2
    inline = await download_history_chunk(
        HistoryInlinePayload(base64.b64encode(compressed_history()).decode())
    )
    assert inline.SerializeToString() == parsed.SerializeToString()


@pytest.mark.parametrize(
    "what,code",
    [
        ("encrypted_hash", "media_enc_hash_mismatch"),
        ("plain_hash", "media_hash_mismatch"),
        ("mac", "media_mac_mismatch"),
        ("length", "media_invalid_descriptor"),
    ],
)
def test_history_integrity_failures(what, code):
    encrypted, descriptor = encrypted_history(compressed_history())
    if what == "encrypted_hash":
        descriptor = replace(descriptor, file_enc_sha256=b"x" * 32)
    elif what == "plain_hash":
        descriptor = replace(descriptor, file_sha256=b"x" * 32)
    elif what == "mac":
        encrypted = encrypted[:-1] + bytes([encrypted[-1] ^ 1])
        descriptor = replace(descriptor, file_enc_sha256=hashlib.sha256(encrypted).digest())
    else:
        descriptor = replace(descriptor, file_length=descriptor.file_length + 1)
    with pytest.raises(MediaIntegrityError) as failure:
        decrypt_history_chunk(encrypted, descriptor)
    assert failure.value.code == code


@pytest.mark.parametrize(
    "payload",
    [
        b"invalid",
        zlib.compress(b"\x00"),
        compressed_history()[:-1],
        compressed_history() + b"trailing",
    ],
)
def test_history_invalid_compression_or_protobuf_refused(payload):
    with pytest.raises(MediaIntegrityError):
        decode_history_sync_payload(payload)


def test_history_bomb_and_plaintext_caps_refused():
    with pytest.raises(MediaIntegrityError) as inflated:
        decode_history_sync_payload(zlib.compress(b"a" * 100_000), max_inflated_bytes=100)
    assert inflated.value.code == "media_too_large"
    encrypted, descriptor = encrypted_history(b"123456789012345")
    with pytest.raises(MediaIntegrityError) as plaintext:
        decrypt_history_chunk(encrypted, replace(descriptor, file_length=None), max_bytes=10)
    assert plaintext.value.code == "media_too_large"


async def test_history_cdn_escape_refused_before_destination_request():
    _encrypted, descriptor = encrypted_history(compressed_history())
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(302, headers={"location": "https://attacker.example/history"})

    with pytest.raises(MediaIntegrityError):
        await download_history_chunk(descriptor, http_transport=httpx.MockTransport(handler))
    assert len(calls) == 1


class ObjectBody:
    def __init__(self, value):
        self.value = io.BytesIO(value)
        self.closed = False

    async def read(self, amount):
        return self.value.read(amount)

    def close(self):
        self.closed = True


class S3Fixture:
    def __init__(self, content=b"plaintext"):
        self.content = content
        self.gets = []
        self.puts = []
        self.bodies = []

    async def head_object(self, **kwargs):
        return {
            "ETag": "fixed-etag",
            "ContentType": "image/jpeg",
            "ContentLength": len(self.content),
        }

    async def get_object(self, **kwargs):
        self.gets.append(kwargs)
        body = ObjectBody(self.content)
        self.bodies.append(body)
        return {"Body": body}

    async def put_object(self, **kwargs):
        assert kwargs["Body"].read() == b"verified plaintext"
        self.puts.append(kwargs)
        return {"ETag": "archive-etag"}


async def test_s3_two_pass_reads_are_etag_pinned_and_closed():
    native = S3Fixture()
    store = S3MediaStore(native, "customer-bucket", prefix="owned/")

    def handler(request):
        assert request.content != native.content
        return httpx.Response(
            200,
            json={"data": {"directPath": "/media/a", "url": "https://mmg.whatsapp.net/media/a"}},
        )

    async with AsyncMessagingClient(KEY, http_transport=httpx.MockTransport(handler)) as client:
        await store.upload_to_whatsapp(
            client.whatsapp_media, "support", "source", media_type="image"
        )
    assert len(native.gets) == 2 and all(
        call == {"Bucket": "customer-bucket", "Key": "owned/source", "IfMatch": "fixed-etag"}
        for call in native.gets
    )
    assert all(body.closed for body in native.bodies) and native.puts == []


@pytest.mark.parametrize("corrupt", [False, True])
async def test_s3_archive_verifies_before_put_and_cleans_private_spool(corrupt):
    encrypted = await encrypt_whatsapp_media(
        b"verified plaintext", media_type="image", mimetype="image/jpeg"
    )
    descriptor = MediaDescriptor(
        "image",
        encrypted.media_key,
        "https://mmg.whatsapp.net/media/a",
        file_sha256=encrypted.file_sha256,
        file_enc_sha256=encrypted.file_enc_sha256,
        file_length=encrypted.file_length,
        mimetype="image/jpeg",
    )
    raw = encrypted.ciphertext
    if corrupt:
        raw = raw[:-1] + bytes([raw[-1] ^ 1])
    native = S3Fixture()
    store = S3MediaStore(native, "customer-bucket", prefix="owned/")
    scratch = Path.home() / ".polymorfa-agent-work/zk-program-20261014/python-s3-spools"
    scratch.mkdir(exist_ok=True)
    if corrupt:
        with pytest.raises(MediaIntegrityError):
            await store.archive(
                descriptor,
                "archive",
                scratch_directory=scratch,
                http_transport=httpx.MockTransport(lambda r: httpx.Response(200, content=raw)),
            )
        assert native.puts == []
    else:
        result = await store.archive(
            descriptor,
            "archive",
            scratch_directory=scratch,
            http_transport=httpx.MockTransport(lambda r: httpx.Response(200, content=raw)),
        )
        assert result.key == "owned/archive" and result.bytes == len(b"verified plaintext")
        assert native.puts[0]["Metadata"] == {
            "wa-media-kind": "image",
            "wa-file-sha256": encrypted.file_sha256.hex(),
        }
        assert "media-key" not in str(native.puts[0]["Metadata"])
    assert list(scratch.iterdir()) == []


def test_direct_history_variant_static_exclusivity():
    result = run_mypy("""
from polymorfa.webhook_models import DirectHistorySyncPayload
payload: DirectHistorySyncPayload = {"delivery":"descriptor","whatsapp_ids":{"linked_devices":"id"},"syncType":"FULL","fileLength":1,"inline":{"encoding":"zlib-base64-protobuf","data":"a"}}
""")
    assert result.returncode == 0, result.stdout
    result = run_mypy("""
from polymorfa.webhook_models import DirectHistorySyncPayload
payload: DirectHistorySyncPayload = {"delivery":"descriptor","whatsapp_ids":{"linked_devices":"id"},"syncType":"FULL","fileLength":1,"inline":{"encoding":"zlib-base64-protobuf","data":"a"},"media":{"type":"md-msg-hist","directPath":"/a","mediaKey":"a","fileSha256":"a","fileEncSha256":"a"}}
""")
    assert result.returncode != 0
