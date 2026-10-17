# Each fixture closure is awaited before advancing its sequential loop.
# ruff: noqa: B023
import json
from pathlib import Path

import pytest

from polymorfa.storage import Storage, apply_event, memory_adapter
from polymorfa.webhooks import parse_verified_webhook_event

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/descriptor-storage/fixture.json").read_text()
)


def event(payload):
    return parse_verified_webhook_event(
        json.dumps(
            {
                "id": "descriptor-event",
                "session": "descriptor-session",
                "event": "history.sync",
                "timestamp": "2026-10-17T00:00:00Z",
                "payload": payload,
            }
        ).encode()
    )


async def test_descriptor_missing_decoder():
    adapter = memory_adapter()
    storage = Storage(adapter)
    with pytest.raises(ValueError, match="descriptor"):
        await apply_event(storage, event(FIXTURE["inline"]))
    assert not await storage.has_event("descriptor-session", "descriptor-event")
    assert not await adapter.rows("history_progress")


import asyncio
import copy
import hashlib
import hmac
from dataclasses import asdict, replace

import httpx

from polymorfa import AsyncProjectClient, Credential, ServerError
from polymorfa.history import HistoryInlinePayload, download_history_chunk
from polymorfa.storage import (
    ENTITY_NAMES,
    Checkpoint,
    OperationBatch,
    StorageCheckpointConflictError,
    storage_webhook_handler,
    sync_to_storage,
)
from polymorfa.webhooks import construct_webhook_event


def signed(payload):
    raw = json.dumps(event(payload).raw).encode()
    secret = "synthetic-descriptor-secret"
    return construct_webhook_event(
        raw, hmac.new(secret.encode(), raw, hashlib.sha256).hexdigest(), secret
    )


@pytest.mark.parametrize("branch", ["inline", "media"])
@pytest.mark.parametrize(
    "mode",
    [
        "missing",
        "archive",
        "null",
        "error",
        "invalid",
        "metadata",
        "metadata-decoder",
        "empty",
        "full",
    ],
)
async def test_descriptor_dispatch(branch, mode):
    adapter = memory_adapter()
    storage = Storage(adapter)
    calls = []

    async def archive(e):
        calls.append("archive")

    async def decoder(payload, e):
        calls.append("descriptor")
        assert payload is e.payload
        if mode == "null":
            return None
        if mode == "error":
            raise ValueError(FIXTURE["media"]["media"]["mediaKey"])
        if mode == "invalid":
            return {"conversations": "invalid"}
        if mode == "empty":
            return {}
        if branch == "inline":
            # The generated full schema decodes the independent protobuf, then the storage reducer projects it.
            return await download_history_chunk(HistoryInlinePayload(payload["inline"]["data"]))
        return FIXTURE["chunk"]

    options = {}
    if mode == "archive":
        options["decode_history"] = archive
    elif mode.startswith("metadata"):
        options["history_descriptor_mode"] = "metadata-only"
        if mode == "metadata-decoder":
            options["decode_history_descriptor"] = decoder
    elif mode != "missing":
        options["decode_history_descriptor"] = decoder
    e = signed(FIXTURE[branch])
    fail = mode in ("missing", "archive", "null", "error", "invalid")
    if fail:
        with pytest.raises(ValueError) as err:
            await storage_webhook_handler(storage, **options)(e)
        assert FIXTURE["media"]["media"]["mediaKey"] not in str(err.value)
        assert all([not await adapter.rows(entity) for entity in ENTITY_NAMES])
    else:
        await storage_webhook_handler(storage, **options)(e)
        assert await adapter.rows("history_progress")
        assert not (await apply_event(storage, e)).applied
    assert await storage.has_event(e.session, e.id) == (not fail)
    rows = await adapter.rows("messages")
    assert len(rows) == (1 if mode == "full" else 0)
    serialized = json.dumps([[asdict(row) for row in await adapter.rows(n)] for n in ENTITY_NAMES])
    for secret in [FIXTURE["inline"]["inline"]["data"], FIXTURE["media"]["media"]["mediaKey"]]:
        assert secret not in serialized
    if rows:
        assert "wa:" in serialized and "synthetic-notification" not in json.dumps(
            [asdict(row) for row in rows]
        )
    if mode == "archive" or mode.startswith("metadata"):
        assert not calls


@pytest.mark.parametrize(
    "patch",
    [
        {"delivery": None},
        {"delivery": "bad"},
        {"media": {}},
        {"inline": None},
        {"whatsapp_ids": {}},
        {"whatsapp_ids": {"linked_devices": None}},
        {"fileLength": None},
        {"fileLength": -1},
        {"fileLength": 1.5},
        {"progress": 101},
        {"progress": True},
        {"syncType": ""},
        {"oldestMessageAt": "2026-02-30T00:00:00Z"},
        {"peerDataRequestSessionId": None},
        {"whatsapp_id": ""},
    ],
)
async def test_descriptor_raw_validation(patch):
    adapter = memory_adapter()
    storage = Storage(adapter)
    with pytest.raises(ValueError, match="descriptor"):
        await apply_event(
            storage, event({**FIXTURE["inline"], **patch}), history_descriptor_mode="metadata-only"
        )
    assert all([not await adapter.rows(entity) for entity in ENTITY_NAMES])


async def test_descriptor_archive_and_cloud_controls():
    p = copy.deepcopy(FIXTURE["inline"])
    del p["delivery"]
    del p["inline"]
    p["messages"] = []
    p["futureField"] = "preserved archive extension"
    for mode in ["missing", "null", "full", "error", "cloud"]:
        storage = Storage(memory_adapter())
        calls = []

        async def archive(e):
            calls.append(e)
            assert e.payload == p
            if mode == "error":
                raise RuntimeError("archive failure")
            return FIXTURE["chunk"] if mode == "full" else None

        options = {} if mode == "missing" else {"decode_history": archive}
        e = event({"kind": "history", "value": {}} if mode == "cloud" else p)
        if mode == "error":
            with pytest.raises(RuntimeError, match="archive failure"):
                await apply_event(storage, e, **options)
            assert not await storage.has_event(e.session, e.id)
        else:
            await apply_event(storage, e, **options)
            assert await storage.has_event(e.session, e.id)
        if mode in ("missing", "cloud"):
            assert not calls


async def test_descriptor_http_sse_ack_and_resume():
    peer = await asyncio.create_subprocess_exec(
        "node",
        str(Path(__file__).parent / "fixtures/descriptor-storage/server.mjs"),
        stdout=asyncio.subprocess.PIPE,
        stderr=asyncio.subprocess.PIPE,
    )
    ready = json.loads(await asyncio.wait_for(peer.stdout.readline(), 5))
    url = ready["baseUrl"]

    try:
        async with httpx.AsyncClient(base_url=url) as fixture_client:
            for branch in ["inline", "media"]:
                for mode in [
                    "missing",
                    "archive",
                    "null",
                    "error",
                    "invalid",
                    "metadata",
                    "metadata-decoder",
                    "empty",
                    "full",
                    "conflict",
                    "ack-error",
                    "malformed",
                ]:
                    payload = {
                        **FIXTURE[branch],
                        **({"delivery": None} if mode == "malformed" else {}),
                    }
                    await fixture_client.post(
                        "/configure", json={"branch": branch, "mode": mode, "payload": payload}
                    )
                    adapter = memory_adapter()
                    storage = Storage(adapter)

                    async def archive(e):
                        raise RuntimeError("archive must not run")

                    async def decoder(p, e):
                        if mode == "null":
                            return None
                        if mode == "error":
                            raise RuntimeError("decoder failure")
                        if mode == "invalid":
                            return []
                        if mode == "empty":
                            return {}
                        if mode == "conflict":
                            await storage.apply(
                                OperationBatch(
                                    "*",
                                    [Checkpoint("*", "events", "competitor", expected_cursor=None)],
                                )
                            )
                        return FIXTURE["chunk"]

                    options = {}
                    if mode == "archive":
                        options["decode_history"] = archive
                    elif mode.startswith("metadata"):
                        options["history_descriptor_mode"] = "metadata-only"
                        if mode == "metadata-decoder":
                            options["decode_history_descriptor"] = decoder
                    elif mode not in ("missing", "malformed"):
                        options["decode_history_descriptor"] = decoder

                    def finish(*args):
                        job.stop()

                    def client():
                        return AsyncProjectClient(
                            Credential(
                                "project_token",
                                "pmfa_pt_AgAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
                            ),
                            project_id="018f0000-0000-7000-8000-000000000077",
                            base_url=url,
                            max_network_retries=0,
                        )

                    async with client() as api:

                        class Source:
                            def stream(self, **kwargs):
                                return api.events.stream(**kwargs)

                            async def acknowledge_stream(self, *args, **kwargs):
                                assert await storage.has_event(
                                    "descriptor-session", "descriptor-event"
                                )
                                assert (
                                    await storage.get_checkpoint("*", "events")
                                ).cursor == "descriptor-cursor"
                                return await api.events.acknowledge_stream(*args, **kwargs)

                        job = sync_to_storage(Source(), storage, on_applied=finish, **options)
                        expected_error = (
                            ValueError
                            if mode
                            in ("missing", "archive", "null", "error", "invalid", "malformed")
                            else StorageCheckpointConflictError
                            if mode == "conflict"
                            else ServerError
                            if mode == "ack-error"
                            else None
                        )
                        if expected_error is None:
                            await asyncio.wait_for(job.done, 5)
                        else:
                            with pytest.raises(expected_error):
                                await asyncio.wait_for(job.done, 5)
                    state = (await fixture_client.get("/state")).json()
                    failed = mode in ("missing", "archive", "null", "error", "invalid", "malformed")
                    assert state["manual"] and state["media"] == 0
                    assert state["acks"] == (0 if failed or mode == "conflict" else 1)
                    assert await storage.has_event("descriptor-session", "descriptor-event") == (
                        not failed
                    )
                    saved = await storage.get_checkpoint("*", "events")
                    assert (saved.cursor if saved else None) == (
                        None
                        if failed
                        else "competitor"
                        if mode == "conflict"
                        else "descriptor-cursor"
                    )
                    assert len(await adapter.rows("messages")) == (
                        1 if mode in ("full", "conflict", "ack-error") else 0
                    )
                    if mode in ("full", "metadata"):
                        async with client() as api:
                            job = sync_to_storage(api.events, storage, on_applied=finish)
                            await asyncio.wait_for(job.done, 5)
                        state = (await fixture_client.get("/state")).json()
                        assert state["lastEventId"] == "descriptor-cursor" and state["acks"] == 2
    finally:
        peer.terminate()
        await asyncio.wait_for(peer.communicate(), 5)


@pytest.mark.parametrize(
    "field", ["whatsapp_ids", "original_whatsapp_ids", "whatsapp_id", "original_whatsapp_id"]
)
@pytest.mark.parametrize("units", [512, 514])
async def test_descriptor_producer_utf16_id_boundary(field, units):
    payload = copy.deepcopy(FIXTURE["inline"])
    value = "😀" * (units // 2)
    payload[field] = {"linked_devices": value} if field.endswith("_ids") else value
    adapter = memory_adapter()
    storage = Storage(adapter)
    if units == 512:
        await apply_event(storage, signed(payload), history_descriptor_mode="metadata-only")
        assert await storage.has_event("descriptor-session", "descriptor-event")
    else:
        with pytest.raises(ValueError, match="descriptor"):
            await apply_event(storage, signed(payload), history_descriptor_mode="metadata-only")
        assert all([not await adapter.rows(entity) for entity in ENTITY_NAMES])


@pytest.mark.parametrize(
    ("value", "valid"),
    [
        ("0000-02-29T00:00Z", True),
        ("2026-10-17T00:00Z", True),
        ("2026-10-17T00:00:00+00:00", False),
        ("2025-02-29T00:00Z", False),
        ("2026-10-17T00:00:00.123Z", True),
    ],
)
async def test_descriptor_producer_datetime(value, valid):
    storage = Storage(memory_adapter())
    e = signed({**FIXTURE["inline"], "oldestMessageAt": value})
    if valid:
        await apply_event(storage, e, history_descriptor_mode="metadata-only")
        assert await storage.has_event(e.session, e.id)
    else:
        with pytest.raises(ValueError, match="descriptor"):
            await apply_event(storage, e, history_descriptor_mode="metadata-only")
        assert not await storage.has_event(e.session, e.id)


@pytest.mark.parametrize("branch", ["top", "inline", "media"])
async def test_descriptor_rejects_unprojected_fields(branch):
    payload = copy.deepcopy(FIXTURE["media" if branch == "media" else "inline"])
    (payload if branch == "top" else payload[branch])["unprojected"] = "synthetic-private-field"
    adapter = memory_adapter()
    with pytest.raises(ValueError, match="descriptor"):
        await apply_event(
            Storage(adapter), signed(payload), history_descriptor_mode="metadata-only"
        )
    assert all([not await adapter.rows(entity) for entity in ENTITY_NAMES])


async def test_unrelated_unknown_event_fields_remain_forward_compatible():
    e = signed({"delivery": "future", "unprojected": "synthetic"})
    e = replace(
        e, event="future.experimental", known=False, raw={**e.raw, "event": "future.experimental"}
    )
    adapter = memory_adapter()
    storage = Storage(adapter)
    await apply_event(storage, e)
    assert await storage.has_event(e.session, e.id)
    assert not await adapter.rows("history_progress")
