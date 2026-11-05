import asyncio
import copy
import threading
from dataclasses import replace

import pytest

from polymorfa.storage import IndexQuery, RowDelete, RowPut, Storage
from polymorfa.storage.convex import ConvexFunctionReferences, convex_adapter
from polymorfa.storage.core import empty_row
from polymorfa.storage.cosmos import cosmos_adapter


class CosmosFixture:
    def __init__(self):
        self.rows = {}
        self.calls = []
        self.partition = ["/namespace"]
        self.race = False

    async def read(self):
        return {"partitionKey": {"paths": self.partition}}

    async def read_item(self, identity, *, partition_key):
        self.calls.append(("read", partition_key))
        if identity not in self.rows:

            class NotFound(Exception):
                status_code = 404

            raise NotFound()
        return copy.deepcopy(self.rows[identity])

    async def execute_item_batch(self, *, batch_operations, partition_key):
        self.calls.append(("batch", partition_key, copy.deepcopy(batch_operations)))
        updated = copy.deepcopy(self.rows)
        for index, operation in enumerate(batch_operations):
            kind, args, *options = operation
            if kind == "create":
                doc = args[0]
                assert doc["id"] not in updated
            else:
                identity, doc = args
                assert options[0]["if_match_etag"] == updated[identity]["_etag"]
            if self.race and index == len(batch_operations) - 1:

                class PreconditionFailed(Exception):
                    status_code = 412

                raise PreconditionFailed()
            updated[doc["id"]] = {**doc, "_etag": str(len(self.calls))}
        self.rows = updated
        return [{"statusCode": 201} for _ in batch_operations]

    def query_items(self, **kwargs):
        self.calls.append(("query", kwargs))

        async def rows():
            for row in self.rows.values():
                if not row["deleted"]:
                    yield copy.deepcopy(row)

        return rows()


async def test_cosmos_partition_verification_fails_closed():
    provider = CosmosFixture()
    native = cosmos_adapter(provider, namespace="customer")
    assert not native.capabilities.atomic_commit
    with pytest.raises(ValueError):
        Storage(native)
    provider.partition = ["/sessionId"]
    with pytest.raises(ValueError):
        await native.setup()
    assert not native.capabilities.atomic_commit


async def test_cosmos_tombstone_etag_race_rolls_back_and_can_recreate():
    provider = CosmosFixture()
    native = cosmos_adapter(provider, namespace="customer")
    await native.setup()
    one = replace(empty_row("messages", {"sessionId": "s", "messageId": "one"}), revision=1)
    two = replace(empty_row("messages", {"sessionId": "s", "messageId": "two"}), revision=1)
    assert (await native.commit([RowPut("messages", one, None)])).ok
    original = copy.deepcopy(provider.rows)
    provider.race = True
    failed = await native.commit([RowPut("messages", two, None), RowDelete("messages", one.id, 1)])
    assert not failed.ok and provider.rows == original
    provider.race = False
    assert (await native.commit([RowDelete("messages", one.id, 1)])).ok
    assert not await native.get("messages", [one.id])
    assert provider.rows["messages:" + one.id]["deleted"]
    assert (await native.commit([RowPut("messages", one, None)])).ok
    assert len(await native.get("messages", [one.id])) == 1
    assert all(call[1] == "customer" for call in provider.calls if call[0] in ("read", "batch"))
    await native.close()
    assert not native.capabilities.atomic_commit


async def test_cosmos_missing_etag_and_foreign_query_refused():
    provider = CosmosFixture()
    native = cosmos_adapter(provider, namespace="customer")
    await native.setup()
    row = replace(empty_row("messages", {"sessionId": "s", "messageId": "one"}), revision=1)
    await native.commit([RowPut("messages", row, None)])
    provider.rows["messages:" + row.id].pop("_etag")
    with pytest.raises(ValueError, match="ETag"):
        await native.commit([RowDelete("messages", row.id, 1)])
    provider.rows["messages:" + row.id]["namespace"] = "foreign"
    with pytest.raises(ValueError, match="foreign"):
        await native.query("messages", IndexQuery("by_chat", {"sessionId": "s", "chatId": "c"}, 10))
    assert provider.calls[-1][1]["partition_key"] == "customer"


class ConvexFixture:
    def __init__(self):
        self.calls = []
        self.rows = []
        self.receipt = {"ok": True}

    def query(self, reference, args):
        self.calls.append((reference, args))
        return self.rows

    def mutation(self, reference, args):
        self.calls.append((reference, args))
        return self.receipt


async def test_convex_registered_handlers_receive_no_caller_namespace_and_exact_writes():
    provider = ConvexFixture()
    native = convex_adapter(
        provider, ConvexFunctionReferences("storage:get", "storage:commit", "storage:query")
    )
    row = replace(empty_row("messages", {"sessionId": "s", "messageId": "one"}), revision=1)
    assert (await native.commit([RowPut("messages", row, None)])).ok
    assert provider.calls == [
        (
            "storage:commit",
            {
                "writes": [
                    {"kind": "put", "entity": "messages", "row": row.wire(), "expectedRev": None}
                ]
            },
        )
    ]
    provider.rows = [row.wire()]
    assert row.id in await native.get("messages", [row.id])
    assert "namespace" not in provider.calls[-1][1]
    with pytest.raises(ValueError, match="unrequested"):
        await native.get("messages", ["foreign"])
    with pytest.raises(ValueError, match="scope"):
        await native.query(
            "messages", IndexQuery("by_chat", {"sessionId": "foreign", "chatId": "c"}, 1)
        )
    provider.receipt = {"ok": False, "conflicts": ["foreign"]}
    with pytest.raises(ValueError, match="conflict"):
        await native.commit([RowPut("messages", row, None)])


async def test_convex_native_call_settles_before_cancellation_returns():
    started, release, settled = threading.Event(), threading.Event(), threading.Event()

    class Provider(ConvexFixture):
        def query(self, reference, args):
            started.set()
            release.wait(2)
            settled.set()
            return []

    native = convex_adapter(
        Provider(), ConvexFunctionReferences("storage:get", "storage:commit", "storage:query")
    )
    request = asyncio.create_task(native.get("messages", ["one"]))
    await asyncio.to_thread(started.wait, 2)
    request.cancel()
    await asyncio.sleep(0)
    assert not request.done()
    release.set()
    with pytest.raises(asyncio.CancelledError):
        await request
    assert settled.is_set()
