"""Public storage synchronization admission and lifetime contracts."""

import asyncio
import copy
import json
from pathlib import Path

import pytest

from polymorfa.events import StreamedEvent
from polymorfa.storage import (
    Checkpoint,
    OperationBatch,
    Storage,
    StorageCheckpointConflictError,
    memory_adapter,
    sync_to_storage,
)
from polymorfa.webhooks import parse_verified_webhook_event

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/descriptor-storage/fixture.json").read_text()
)


def event():
    return parse_verified_webhook_event(
        json.dumps(
            {
                "id": "graceful-event",
                "session": "graceful",
                "event": "history.sync",
                "timestamp": "2026-10-17T00:00:00Z",
                "payload": FIXTURE["inline"],
            }
        ).encode()
    )


class Barrier:
    def __init__(self):
        self.entered = asyncio.Event()
        self.release = asyncio.Event()

    async def hold(self):
        self.entered.set()
        await self.release.wait()


class FixtureSource:
    def __init__(self, storage, barrier=None, phase=None, failure=None):
        self.storage = storage
        self.barrier = barrier
        self.phase = phase
        self.failure = failure
        self.reads = 0
        self.closes = 0
        self.acks = []
        self.opened = False
        self.idle = asyncio.Event()
        self.next_cancelled = asyncio.Event()
        self.order = []

    def stream(self, **kwargs):
        self.opened = True
        self.options = kwargs
        return self

    def __aiter__(self):
        return self

    async def __anext__(self):
        self.reads += 1
        if self.phase == "idle" or self.reads > 1:
            self.idle.set()
            try:
                await asyncio.Event().wait()
            finally:
                self.next_cancelled.set()
        return StreamedEvent({}, event(), "cursor", "stream", 1)

    async def close(self):
        self.closes += 1
        if self.failure == "cleanup":
            raise RuntimeError("cleanup failure")

    async def acknowledge_stream(self, stream_id, cursor, sequence, **kwargs):
        assert await self.storage.has_event("graceful", "graceful-event")
        assert (await self.storage.get_checkpoint("*", "events")).cursor == "cursor"
        self.order.append("ack")
        if self.phase == "ack":
            await self.barrier.hold()
        if self.failure == "ack":
            raise RuntimeError("ack refusal")
        self.acks.append((stream_id, cursor, sequence))


class ObservedStorage(Storage):
    def __init__(self, barrier, phase):
        self.memory = memory_adapter()
        super().__init__(self.memory)
        self.barrier = barrier
        self.phase = phase
        self.order = []

    async def apply(self, batch):
        checkpoint = bool(batch.operations and isinstance(batch.operations[0], Checkpoint))
        name = "checkpoint" if checkpoint else "apply"
        self.order.append(name)
        if self.phase == name:
            await self.barrier.hold()
        return await super().apply(batch)


@pytest.mark.parametrize("phase", ["decode", "apply", "checkpoint", "ack", "callback"])
async def test_stop_finishes_every_admitted_phase_and_closes_once(phase):
    barrier = Barrier()
    storage = ObservedStorage(barrier, phase)
    source = FixtureSource(storage, barrier, phase)
    calls = []

    async def decode(descriptor, original):
        calls.append("decode")
        if phase == "decode":
            await barrier.hold()
        return copy.deepcopy(FIXTURE["chunk"])

    async def callback(item, result):
        assert source.acks == [("stream", "cursor", 1)]
        calls.append("callback")
        if phase == "callback":
            await barrier.hold()
        calls.append("callback-finished")

    sync = sync_to_storage(source, storage, decode_history_descriptor=decode, on_applied=callback)
    await asyncio.wait_for(barrier.entered.wait(), 2)
    sync.stop()
    sync.stop()
    waiter = asyncio.create_task(sync.close())
    second = asyncio.create_task(sync.close())
    await asyncio.sleep(0)
    assert not sync.done.done(), "stop cancelled admitted work"
    barrier.release.set()
    await asyncio.wait_for(asyncio.gather(waiter, second), 2)
    assert not sync.done.cancelled()
    assert calls == ["decode", "callback", "callback-finished"]
    assert storage.order == ["apply", "checkpoint"]
    assert source.acks == [("stream", "cursor", 1)]
    assert source.reads == 1 and source.closes == 1
    assert await storage.has_event("graceful", "graceful-event")
    assert len(await storage.memory.rows("messages")) == 1
    await sync.close()
    assert source.closes == 1


async def test_cancelled_close_waiter_does_not_cancel_worker_or_other_waiters():
    barrier = Barrier()
    storage = ObservedStorage(barrier, "apply")
    source = FixtureSource(storage)
    sync = sync_to_storage(
        source,
        storage,
        decode_history_descriptor=lambda *_: asyncio.sleep(0, result=FIXTURE["chunk"]),
    )
    await barrier.entered.wait()
    one = asyncio.create_task(sync.close())
    two = asyncio.create_task(sync.close())
    await asyncio.sleep(0)
    one.cancel()
    with pytest.raises(asyncio.CancelledError):
        await one
    assert not sync.done.done()
    barrier.release.set()
    await asyncio.wait_for(two, 2)
    assert source.acks and source.closes == 1


@pytest.mark.parametrize("bare_waiter", [False, True])
async def test_explicit_hard_cancellation_propagates_even_when_stop_races(bare_waiter):
    barrier = Barrier()
    storage = ObservedStorage(barrier, "apply")
    source = FixtureSource(storage)
    sync = sync_to_storage(
        source,
        storage,
        decode_history_descriptor=lambda *_: asyncio.sleep(0, result=FIXTURE["chunk"]),
    )
    await barrier.entered.wait()
    if bare_waiter:

        async def wait():
            await sync.done

        task = asyncio.create_task(wait())
        await asyncio.sleep(0)
    else:
        task = sync.done
    sync.stop()
    task.cancel()
    with pytest.raises(asyncio.CancelledError):
        await task
    assert sync.done.cancelled()
    assert not source.acks and source.closes == 1
    assert not await storage.has_event("graceful", "graceful-event")


async def test_bootstrap_stop_opens_no_stream():
    barrier = Barrier()

    class Bootstrap(Storage):
        async def get_checkpoint(self, *args):
            await barrier.hold()
            return await super().get_checkpoint(*args)

    storage = Bootstrap(memory_adapter())
    source = FixtureSource(storage)
    sync = sync_to_storage(source, storage)
    await barrier.entered.wait()
    sync.stop()
    assert not sync.done.done()
    barrier.release.set()
    await asyncio.wait_for(sync.done, 2)
    assert not source.opened


async def test_idle_stop_settles_owned_read_and_watcher_without_task_leak():
    before = asyncio.all_tasks()
    storage = Storage(memory_adapter())
    source = FixtureSource(storage, phase="idle")
    sync = sync_to_storage(source, storage)
    await source.idle.wait()
    await asyncio.wait_for(sync.close(), 2)
    assert source.next_cancelled.is_set() and source.closes == 1
    assert not source.acks
    await asyncio.sleep(0)
    assert asyncio.all_tasks() <= before


async def test_set_stop_wins_same_turn_ready_item_admission():
    barrier = Barrier()
    storage = Storage(memory_adapter())

    class Ready(FixtureSource):
        async def __anext__(self):
            await barrier.hold()
            return StreamedEvent({}, event(), "cursor", "stream", 1)

    source = Ready(storage)
    sync = sync_to_storage(source, storage)
    await barrier.entered.wait()
    barrier.release.set()
    sync.stop()
    await asyncio.wait_for(sync.done, 2)
    assert not source.acks and source.closes == 1
    assert not await storage.has_event("graceful", "graceful-event")


@pytest.mark.parametrize("failure", ["decode", "apply", "checkpoint", "ack", "callback"])
async def test_admitted_errors_survive_stop_and_cleanup_failure(failure):
    barrier = Barrier()
    storage = ObservedStorage(barrier, None)
    source = FixtureSource(storage, failure="cleanup")
    original_apply = storage.apply

    async def fail_after_stop(name):
        if name == failure:
            await barrier.hold()
            raise RuntimeError(name + " primary")

    async def apply(batch):
        await fail_after_stop(
            "checkpoint" if isinstance(batch.operations[0], Checkpoint) else "apply"
        )
        return await original_apply(batch)

    storage.apply = apply

    async def decode(*_):
        await fail_after_stop("decode")
        return FIXTURE["chunk"]

    original_ack = source.acknowledge_stream

    async def ack(*args, **kwargs):
        await fail_after_stop("ack")
        return await original_ack(*args, **kwargs)

    source.acknowledge_stream = ack

    async def callback(*_):
        await fail_after_stop("callback")

    sync = sync_to_storage(source, storage, decode_history_descriptor=decode, on_applied=callback)
    await barrier.entered.wait()
    sync.stop()
    # Descriptor errors retain their accepted safe redaction.
    with pytest.raises(
        ValueError if failure == "decode" else RuntimeError,
        match="descriptor" if failure == "decode" else failure + " primary",
    ):
        barrier.release.set()
        await asyncio.wait_for(sync.done, 2)
    assert source.closes == 1
    if failure in ("decode", "apply"):
        assert not await storage.has_event("graceful", "graceful-event")
    if failure in ("decode", "apply", "checkpoint"):
        assert await storage.get_checkpoint("*", "events") is None and not source.acks
    if failure == "ack":
        assert (await storage.get_checkpoint("*", "events")).cursor == "cursor" and not source.acks


async def test_checkpoint_cas_conflict_after_stop_stays_failed():
    barrier = Barrier()
    storage = ObservedStorage(barrier, "checkpoint")
    source = FixtureSource(storage)
    sync = sync_to_storage(
        source,
        storage,
        decode_history_descriptor=lambda *_: asyncio.sleep(0, result=FIXTURE["chunk"]),
    )
    await barrier.entered.wait()
    # Call the real engine to write a competing checkpoint while this one is held.
    await Storage.apply(
        storage,
        OperationBatch("*", [Checkpoint("*", "events", "competitor", expected_cursor=None)]),
    )
    sync.stop()
    barrier.release.set()
    with pytest.raises(StorageCheckpointConflictError):
        await asyncio.wait_for(sync.done, 2)
    assert (await storage.get_checkpoint("*", "events")).cursor == "competitor"
    assert await storage.has_event("graceful", "graceful-event") and not source.acks


@pytest.mark.parametrize("self_join", [False, True])
async def test_callback_stop_is_graceful_and_self_join_is_explicit(self_join):
    storage = Storage(memory_adapter())
    source = FixtureSource(storage)

    async def callback(*_):
        if self_join:
            await sync.close()
        else:
            sync.stop()

    sync = sync_to_storage(
        source,
        storage,
        decode_history_descriptor=lambda *_: asyncio.sleep(0, result=FIXTURE["chunk"]),
        on_applied=callback,
    )
    if self_join:
        with pytest.raises(RuntimeError, match="externally"):
            await asyncio.wait_for(sync.done, 2)
    else:
        await asyncio.wait_for(sync.done, 2)
    assert source.acks and source.closes == 1 and source.reads == 1


@pytest.mark.parametrize("mode", ["false-commit", "stolen-fence"])
async def test_real_atomic_commit_refusal_after_stop_cannot_advance(mode):
    from dataclasses import replace

    from polymorfa.storage import CommitResult, RowPut, StorageConflictError, StorageLeaseLostError
    from polymorfa.storage.memory import MemoryAdapter

    barrier = Barrier()

    class RefusingMemory(MemoryAdapter):
        async def commit(self, writes):
            data = [w for w in writes if isinstance(w, RowPut) and w.entity != "leases"]
            if data:
                await barrier.hold()
                if mode == "false-commit":
                    return CommitResult(False, (data[0].row.id,))
                fence = next(w for w in writes if isinstance(w, RowPut) and w.entity == "leases")
                current = (await self.get("leases", [fence.row.id]))[fence.row.id]
                stolen = replace(
                    current,
                    revision=current.revision + 1,
                    values={**current.values, "owner": "competitor"},
                )
                assert (await super().commit([RowPut("leases", stolen, current.revision)])).ok
            return await super().commit(writes)

    adapter = RefusingMemory()
    storage = Storage(adapter, max_retries=0)
    source = FixtureSource(storage)
    sync = sync_to_storage(
        source,
        storage,
        decode_history_descriptor=lambda *_: asyncio.sleep(0, result=FIXTURE["chunk"]),
    )
    await barrier.entered.wait()
    sync.stop()
    barrier.release.set()
    with pytest.raises(StorageConflictError if mode == "false-commit" else StorageLeaseLostError):
        await asyncio.wait_for(sync.done, 2)
    assert not await storage.has_event("graceful", "graceful-event")
    assert await storage.get_checkpoint("*", "events") is None and not source.acks
    assert not await adapter.rows("messages")
    if mode == "stolen-fence":
        assert (await adapter.rows("leases"))[0].values["owner"] == "competitor"


@pytest.mark.parametrize("mode", ["success", "ack-error", "headers"])
async def test_native_platform_sse_storage_held_manual_ack_and_idle_headers(mode):
    import base64

    from polymorfa import AsyncProjectClient, Credential, ServerError

    storage = Storage(memory_adapter())
    ack_entered, ack_release, opened, stream_closed = (asyncio.Event() for _ in range(4))
    handlers = set()
    failures = []
    requests = []
    project = "018f0000-0000-7000-8000-000000000077"

    async def serve(reader, writer):
        handlers.add(asyncio.current_task())
        try:
            raw = await reader.readuntil(b"\r\n\r\n")
            lines = raw.decode().split("\r\n")
            headers = {
                line.split(":", 1)[0].lower(): line.split(":", 1)[1].strip()
                for line in lines[1:]
                if ":" in line
            }
            requests.append(lines[0])
            assert (
                headers["authorization"]
                == "Bearer pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"
            )
            assert headers["polymorfa-version"] == "2026-09-22"
            if lines[0].startswith("POST "):
                body = json.loads(await reader.readexactly(int(headers["content-length"])))
                assert body == {"cursor": "cursor", "sequence": 2}
                assert f"/platform/projects/{project}/events/stream/stream/ack" in lines[0]
                assert await storage.has_event("graceful", "graceful-event")
                assert (await storage.get_checkpoint("*", "events")).cursor == "cursor"
                ack_entered.set()
                await ack_release.wait()
                data = (
                    {
                        "error": {
                            "message": "synthetic refusal",
                            "code": "ack_failed",
                            "type": "api_error",
                        }
                    }
                    if mode == "ack-error"
                    else {
                        "data": {
                            "streamId": "stream",
                            "acknowledgedCursor": "cursor",
                            "sequence": 2,
                            "replayed": False,
                        }
                    }
                )
                encoded = json.dumps(data).encode()
                writer.write(
                    (
                        b"HTTP/1.1 503 Service Unavailable"
                        if mode == "ack-error"
                        else b"HTTP/1.1 200 OK"
                    )
                    + b"\r\nContent-Type: application/json\r\nContent-Length: "
                    + str(len(encoded)).encode()
                    + b"\r\nConnection: close\r\n\r\n"
                    + encoded
                )
                await writer.drain()
            else:
                assert (
                    f"/platform/projects/{project}/events/stream?" in lines[0]
                    and "ack=manual" in lines[0]
                )
                opened.set()
                if mode != "headers":
                    encoded = base64.b64encode(json.dumps(event().raw).encode()).decode()
                    ready = {
                        "v": 1,
                        "type": "ready",
                        "streamId": "stream",
                        "sequence": 1,
                        "heartbeatIntervalMs": 15000,
                    }
                    data = {
                        "v": 1,
                        "type": "event",
                        "streamId": "stream",
                        "sequence": 2,
                        "cursor": "cursor",
                        "event": {
                            "id": "graceful-event",
                            "organizationId": "fixture-org",
                            "projectId": project,
                            "type": "history.sync",
                            "source": "runtime",
                            "environment": "development",
                            "createdAt": "2026-10-17T00:00:00Z",
                            "payloadAvailability": "available",
                            "payload": {
                                "encoding": "base64",
                                "contentType": "application/json",
                                "data": encoded,
                            },
                            "replayableUntil": None,
                            "metadataExpiresAt": "2026-10-18T00:00:00Z",
                        },
                    }
                    wire = (
                        "event: ready\ndata: "
                        + json.dumps(ready)
                        + "\n\nevent: event\nid: cursor\ndata: "
                        + json.dumps(data)
                        + "\n\n"
                    )
                    writer.write(
                        b"HTTP/1.1 200 OK\r\nContent-Type: text/event-stream\r\nConnection: close\r\n\r\n"
                        + wire.encode()
                    )
                    await writer.drain()
                assert await reader.read() == b""
                stream_closed.set()
        except Exception as error:  # noqa: BLE001 - expose every native fixture failure to the test.
            failures.append(error)
        finally:
            writer.close()
            await writer.wait_closed()
            handlers.discard(asyncio.current_task())

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    port = server.sockets[0].getsockname()[1]
    try:
        async with AsyncProjectClient(
            Credential(
                "project_token",
                "pmfa_pt_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
            ),
            project,
            base_url=f"http://127.0.0.1:{port}",
            max_network_retries=0,
        ) as api:
            callbacks = []

            async def applied(*_):
                callbacks.append("finished")

            job = sync_to_storage(
                api.events,
                storage,
                decode_history_descriptor=lambda *_: asyncio.sleep(0, result=FIXTURE["chunk"]),
                on_applied=applied,
            )
            if mode == "headers":
                await asyncio.wait_for(opened.wait(), 2)
            else:
                await asyncio.wait_for(ack_entered.wait(), 2)
            job.stop()
            close = asyncio.create_task(job.close())
            await asyncio.sleep(0)
            if mode != "headers":
                assert not job.done.done()
                ack_release.set()
            if mode == "ack-error":
                with pytest.raises(ServerError):
                    await asyncio.wait_for(close, 2)
                assert not callbacks
                assert (await storage.get_checkpoint("*", "events")).cursor == "cursor"
            else:
                await asyncio.wait_for(close, 2)
                assert callbacks == ([] if mode == "headers" else ["finished"])
            await asyncio.wait_for(stream_closed.wait(), 2)
            assert len(requests) == (1 if mode == "headers" else 2)
        assert not failures
    finally:
        ack_release.set()
        server.close()
        await server.wait_closed()
        if handlers:
            await asyncio.wait_for(asyncio.gather(*list(handlers), return_exceptions=True), 2)
