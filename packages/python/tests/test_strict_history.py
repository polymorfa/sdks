"""Independent compressed-stream proof through the actual public history API."""

import asyncio
import base64
import hashlib
import hmac
import json
import ssl
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from polymorfa import MediaIntegrityError
from polymorfa.events import StreamedEvent
from polymorfa.history import (
    HistoryChunkDescriptor,
    HistoryInlinePayload,
    decode_history_sync_payload,
    download_history_chunk,
    history_sync_to_dict,
)
from polymorfa.storage import Storage, memory_adapter, sync_to_storage
from polymorfa.storage.core import ENTITY_NAMES
from polymorfa.webhooks import construct_webhook_event

FIXTURES = Path(__file__).parent / "fixtures" / "strict-history"
CORPUS = json.loads((FIXTURES / "strict-history.json").read_text())


def b64(value):
    return base64.b64decode(value)


def stream(name):
    return b64(CORPUS["streams"][name]["input"])


def plaintext(name):
    value = CORPUS["plain"][name]
    if "base64" in value:
        return b64(value["base64"])
    size = value["zeroFieldBytes"]
    varint = bytearray()
    n = size
    while n > 127:
        varint.append((n & 127) | 128)
        n >>= 7
    return b"\x08\x03\xa2\x06" + varint + bytes([n]) + bytes(size)


def malformed(recipe):
    if "hex" in recipe:
        return bytes.fromhex(recipe["hex"])
    data = bytearray(stream(recipe["base"]))
    if "cut" in recipe:
        data = data[: recipe["cut"]]
    if "flip" in recipe:
        data[recipe["flip"]] ^= recipe.get("mask", 1)
    if "append" in recipe:
        data.extend(stream(recipe["append"]))
    data.extend(bytes.fromhex(recipe.get("tailHex", "")))
    return bytes(data)


async def decode(path, data, **options):
    if path == 0:
        return decode_history_sync_payload(data, **options)
    return await download_history_chunk(HistoryInlinePayload(data), **options)


async def refusal(path, data, code="media_invalid_ciphertext", **options):
    with pytest.raises(MediaIntegrityError) as error:
        await decode(path, data, **options)
    assert error.value.code == code


async def test_strict_history_independent_corpus():
    complete = refused = protobuf = 0
    for name, value in CORPUS["streams"].items():
        for path in range(2):
            if value["plain"] in ["empty", "invalid-protobuf"]:
                await refusal(path, stream(name))
                protobuf += 1
                continue
            result = await decode(path, stream(name))
            assert result.SerializeToString() == plaintext(value["plain"]), name
            if value["plain"] == "provider":
                assert (result.syncType, result.chunkOrder, result.progress) == (3, 7, 92)
                assert result.conversations[0].lastMsgTimestamp == 2**64 - 1
                assert b"unknown provider data" in result.SerializeToString()
            complete += 1
    for recipe in CORPUS["invalid"]:
        for path in range(2):
            await refusal(path, malformed(recipe))
            plain = CORPUS["streams"].get(recipe.get("base"), {}).get("plain")
            if plain in ["empty", "invalid-protobuf"]:
                protobuf += 1
            else:
                refused += 1
    assert (complete, refused, protobuf) == (64, 5728, 268)
    print(
        f"public corpus complete={complete} compressedRefusals={refused} protobufPolicyOnly={protobuf}"
    )


async def test_strict_history_headers_stored_blocks_and_valid_padding():
    complete = incomplete = 0
    for value in json.loads((FIXTURES / "strict-history-headers.json").read_text()):
        data = b"".join(
            b64(s["base64"]) if "base64" in s else bytes([s["byte"]]) * s["count"]
            for s in value["segments"]
        )
        assert hashlib.sha256(data).hexdigest() == value["sha256"]
        for path in range(2):
            if value["compression"] == "valid":
                assert (await decode(path, data)).SerializeToString() == b64(value["plain"])
                complete += 1
            else:
                await refusal(path, data)
                incomplete += 1
    valid = refused = protobuf = 0
    for value in json.loads((FIXTURES / "strict-history-dotnet.json").read_text()):
        data, raw = b64(value["input"]), b64(value["plain"])
        for path in range(2):
            if raw:
                result = await decode(path, data, max_inflated_bytes=len(raw))
                assert result.SerializeToString() == raw
                valid += 1
            else:
                await refusal(path, data)
                protobuf += 1
            for bad in [data[:-1], data + b"\0"]:
                await refusal(path, bad)
                if raw:
                    refused += 1
                else:
                    protobuf += 1
    boundaries = 0
    for value in json.loads((FIXTURES / "go-header-boundaries.json").read_text()):
        # supported in this file records Go's policy. Python accepts all these headers.
        for path in range(2):
            assert (await decode(path, b64(value["input"]))).SerializeToString() == b"\x08\x03"
            boundaries += 1
    assert (complete, incomplete, valid, refused, protobuf, boundaries) == (30, 2, 166, 332, 6, 40)
    print(
        "headers complete=30 incomplete=2; supplemental valid=166 compressedRefusals=332 "
        "protobufPolicyOnly=6; small headers/padding complete=40"
    )


async def test_strict_history_exact_caps_and_late_corrupt_trailer():
    assertions = 0
    for fmt in ["gzip", "zlib", "raw"]:
        data = stream("provider-" + fmt)
        for path in range(2):
            assert (
                await decode(path, data, max_inflated_bytes=len(plaintext("provider")))
            ).syncType == 3
            await refusal(
                path, data, "media_too_large", max_inflated_bytes=len(plaintext("provider")) - 1
            )
            assert (await decode(path, data, max_bytes=len(data))).syncType == 3
            await refusal(path, data, "media_too_large", max_bytes=len(data) - 1)
            assertions += 4
    for fmt in ["gzip", "zlib"]:
        data = bytearray(stream("large-" + fmt))
        data[-1] ^= 1
        for path in range(2):
            await refusal(path, bytes(data), "media_too_large", max_inflated_bytes=8192)
            assertions += 1
    assert assertions == 28
    print("caps and late corrupt trailer: 28 public checks")


class NativePeerTransport(httpx.AsyncBaseTransport):
    def __init__(self, ready):
        self.ready = ready
        context = ssl.create_default_context(cadata=b64(ready["certificate"]).decode())
        self.inner = httpx.AsyncHTTPTransport(verify=context, trust_env=False)

    async def handle_async_request(self, request):
        assert request.url.scheme == "https" and request.url.host == "mmg.whatsapp.net"
        routed = httpx.Request(
            request.method,
            request.url.copy_with(host="127.0.0.1", port=self.ready["port"]),
            headers=request.headers,
            stream=request.stream,
            extensions={**request.extensions, "sni_hostname": "mmg.whatsapp.net"},
        )
        return await self.inner.handle_async_request(routed)

    async def aclose(self):
        await self.inner.aclose()


async def test_strict_history_independently_authenticated_native_download_and_cancel():
    peer = await asyncio.create_subprocess_exec(
        "node", str(FIXTURES / "strict-history-server.mjs"), stdout=asyncio.subprocess.PIPE
    )
    try:
        ready = json.loads(await peer.stdout.readline())

        def descriptor(name):
            value = ready["descriptors"][name]
            return HistoryChunkDescriptor(
                value["directPath"],
                bytes.fromhex(value["mediaKey"]),
                bytes.fromhex(value["fileSha256"]),
                bytes.fromhex(value["fileEncSha256"]),
                value["fileLength"],
            )

        for name in ["gzip", "zlib", "raw", "tail", "concat", "checksum", "tampered", "large"]:
            value = descriptor("gzip" if name == "tampered" else name)
            if name == "tampered":
                value = replace(value, direct_path="/tampered.enc")
            options = {"http_transport": NativePeerTransport(ready)}
            if name == "large":
                options["max_inflated_bytes"] = 8192
            if name in ["gzip", "zlib", "raw"]:
                assert (await download_history_chunk(value, **options)).syncType == 3
            else:
                with pytest.raises(MediaIntegrityError) as error:
                    await download_history_chunk(value, **options)
                assert error.value.code == (
                    "media_enc_hash_mismatch"
                    if name == "tampered"
                    else "media_too_large"
                    if name == "large"
                    else "media_invalid_ciphertext"
                )
        pre = asyncio.create_task(
            download_history_chunk(descriptor("gzip"), http_transport=NativePeerTransport(ready))
        )
        pre.cancel()
        with pytest.raises(asyncio.CancelledError):
            await pre
        task = asyncio.create_task(
            download_history_chunk(descriptor("gate"), http_transport=NativePeerTransport(ready))
        )
        async with httpx.AsyncClient(transport=NativePeerTransport(ready)) as client:
            for _ in range(100):
                state = (await client.get("https://mmg.whatsapp.net/state")).json()
                if state["waiting"]:
                    break
                await asyncio.sleep(0.01)
            assert state["waiting"] == 1
            task.cancel()
            with pytest.raises(asyncio.CancelledError):
                await task
            state = (await client.get("https://mmg.whatsapp.net/state")).json()
        assert len(state["requests"]) == 9
        assert all(
            not r["authorization"]
            and not r["cookie"]
            and not r["version"]
            and r["mms"] == "md-msg-hist"
            for r in state["requests"]
        )
        print(
            "authenticated: 3 valid, 3 compression refusals, tamper, quota, stalled cancellation; "
            "pre-scheduled cancellation; 9 credential-free requests"
        )
    finally:
        peer.terminate()
        await asyncio.wait_for(peer.communicate(), 5)


async def test_strict_history_signed_archive_refusal_prevents_all_storage_and_ack():
    for bad in [False, True]:
        data = stream("provider-gzip") + (b"\0" if bad else b"")
        raw = json.dumps(
            {
                "id": "signed-archive",
                "session": "fixture-session",
                "timestamp": "2026-10-17T00:00:00Z",
                "event": "history.sync",
                "payload": {
                    "mode": "deliver",
                    "messages": [],
                    "syncType": "RECENT",
                    "chunkOrder": 7,
                    "progress": 92,
                    "fileLength": len(data),
                    "conversationCount": 1,
                    "messageCount": 0,
                    "pushNameCount": 0,
                    "statusMessageCount": 0,
                    "whatsapp_ids": {"linked_devices": "fixture-archive"},
                    "whatsapp": {
                        "encoding": "gzip-base64-protobuf",
                        "data": base64.b64encode(data).decode(),
                    },
                },
            }
        ).encode()
        secret = "synthetic-archive-secret"
        event = construct_webhook_event(
            raw, hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest(), secret
        )
        adapter = memory_adapter()
        storage = Storage(adapter)
        acks = []

        class Source:
            def __init__(self, event, acks):
                self.event, self.acks = event, acks

            def stream(self, **kwargs):
                assert kwargs["manual_ack"] and kwargs["since"] is None

                async def items():
                    yield StreamedEvent({}, self.event, "after-archive", "fixture-stream", 1)

                return items()

            async def acknowledge_stream(self, *args, **kwargs):
                self.acks.append(args)

        async def archive_decode(item):
            decoded = await download_history_chunk(
                HistoryInlinePayload(item.payload["whatsapp"]["data"])
            )
            return history_sync_to_dict(decoded)

        job = sync_to_storage(Source(event, acks), storage, decode_history=archive_decode)
        if bad:
            with pytest.raises(MediaIntegrityError) as error:
                await job.done
            assert error.value.code == "media_invalid_ciphertext"
            assert not acks and not await storage.has_event(event.session, event.id)
            assert await storage.get_checkpoint("*", "events") is None
            assert all([not await adapter.rows(entity) for entity in ENTITY_NAMES])
        else:
            await job.done
            assert len(acks) == 1 and await storage.has_event(event.session, event.id)
            assert (await storage.get_checkpoint("*", "events")).cursor == "after-archive"
            assert len(await adapter.rows("chats")) == 1
    print(
        "signed archive: invalid decoder leaves all rows/markers/progress/checkpoint/ACK absent; valid applies/ACKs"
    )
