import copy
import hashlib
import hmac
import json
import os
import secrets
from dataclasses import replace
from pathlib import Path

import httpx
import pytest

from polymorfa import ConfigurationError, ServerError
from polymorfa.events import StreamedEvent
from polymorfa.storage import (
    ChatWatermarkGuard,
    Checkpoint,
    ClearChat,
    CommitResult,
    FieldWrite,
    IndexQuery,
    OperationBatch,
    RowPut,
    Storage,
    StorageCapabilities,
    StorageCheckpointConflictError,
    StorageConflictError,
    Upsert,
    canonical_json,
    encode_key,
    memory_adapter,
)
from polymorfa.storage.core import empty_row, merge_fields
from polymorfa.storage.d1 import D1BridgeAdapter, d1_bridge_adapter
from polymorfa.storage.reduce_events import reduce_event
from polymorfa.storage.reduce_history import (
    HistoryIdentityIndex,
    HistoryKeys,
    HistoryMessageIdentity,
    reduce_history_chunk,
)
from polymorfa.storage.sqlite import sqlite_adapter
from polymorfa.storage.sync import (
    StoragePayloadUnavailableError,
    StorageStreamGapError,
    sync_to_storage,
)
from polymorfa.webhooks import WebhookEvent

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads((ROOT / "packages/storage/conformance-fixtures.json").read_text())
BRIDGE = json.loads((Path(__file__).parent / "fixtures/d1-bridge.json").read_text())
ARTIFACTS = Path(
    os.environ.get(
        "SDK_TEST_ARTIFACT_DIR",
        str(Path.home() / ".polymorfa-agent-work/zk-program-20261014/python-storage-tests"),
    )
)
ARTIFACTS = ARTIFACTS / "storage"
ARTIFACTS.mkdir(parents=True, exist_ok=True)


@pytest.mark.skipif(
    not os.environ.get("POLYMORFA_TEST_D1_BRIDGE_URL"),
    reason="An application-owned Worker/Miniflare D1 fixture is required",
)
async def test_native_worker_d1_history_atomicity_replay_and_checkpoint():
    native = await d1_bridge_adapter(
        os.environ["POLYMORFA_TEST_D1_BRIDGE_URL"],
        BRIDGE["secret"],
        authority=BRIDGE["authority"],
        table_prefix=BRIDGE["tablePrefix"],
    )
    session = "python-native-" + secrets.token_hex(16)
    try:
        await native.setup()
        storage = Storage(native)
        chunk = copy.deepcopy(FIXTURE["history"])
        template = chunk["conversations"][0]["messages"][0]
        for chat_index, conversation in enumerate(chunk["conversations"]):
            conversation["messages"] = []
            for index in range(100):
                message = copy.deepcopy(template)
                message["message"]["key"]["id"] = f"large-{chat_index}-{index}"
                message["message"]["key"]["remoteJid"] = conversation["id"]
                conversation["messages"].append(message)
        batch = reduce_history_chunk(session, chunk, chunk_id="large")
        assert (await storage.apply(batch)).applied
        assert not (await storage.apply(batch)).applied
        total = 0
        for conversation in chunk["conversations"]:
            page = await storage.query(
                "messages",
                IndexQuery(
                    "by_chat", {"sessionId": session, "chatId": "wa:" + conversation["id"]}, 1000
                ),
            )
            total += len(page.rows)
        assert total == 2000
        one = replace(empty_row("messages", {"sessionId": session, "messageId": "one"}), revision=1)
        two = replace(empty_row("messages", {"sessionId": session, "messageId": "two"}), revision=1)
        assert (await native.commit([RowPut("messages", one, None)])).ok
        result = await native.commit(
            [RowPut("messages", two, None), RowPut("messages", replace(one, revision=2), 8)]
        )
        assert not result.ok and not await native.get("messages", [two.id])
        await storage.apply(
            OperationBatch(session, [Checkpoint(session, "events", "one", expected_cursor=None)])
        )
        with pytest.raises(StorageCheckpointConflictError):
            await storage.apply(
                OperationBatch(
                    session, [Checkpoint(session, "events", "two", expected_cursor=None)]
                )
            )
        assert (await storage.get_checkpoint(session, "events")).cursor == "one"
    finally:
        # Shared fixture: retain only this test's namespaced data; never truncate it.
        await native.close()


def envelope(value):
    return WebhookEvent(
        value["id"],
        value["session"],
        value["timestamp"],
        value["event"],
        value["payload"],
        value,
        True,
    )


@pytest.fixture(params=["memory", "sqlite"])
async def adapter(request):
    if request.param == "memory":
        native = memory_adapter()
    else:
        path = ARTIFACTS / (secrets.token_hex(12) + ".sqlite")
        native = sqlite_adapter(path)
        await native.setup()
    yield native
    await native.close()
    if request.param == "sqlite":
        path.unlink(missing_ok=True)


async def all_rows(adapter, entity):
    if hasattr(adapter, "rows"):
        return await adapter.rows(entity)
    keys = list(FIXTURE["eventRows"].get(entity, []))
    keys.extend(FIXTURE["historyRows"].get(entity, []))
    return list(
        (await adapter.get(entity, list({encode_key(entity, row) for row in keys}))).values()
    )


@pytest.mark.parametrize("kind", ["events", "history"])
async def test_independent_typescript_schema2_conformance_fixture(adapter, kind):
    storage = Storage(adapter)
    if kind == "events":
        for value in FIXTURE["events"]:
            await storage.apply(reduce_event(envelope(value)))
        expected = FIXTURE["eventRows"]
    else:
        batch = reduce_history_chunk("portable-fixture", FIXTURE["history"], chunk_id="chunk")
        assert (await storage.apply(batch)).applied
        assert not (await storage.apply(batch)).applied
        expected = FIXTURE["historyRows"]
    for entity, rows in expected.items():
        current = await adapter.get(entity, [encode_key(entity, row) for row in rows])
        actual = [row.values for row in sorted(current.values(), key=lambda row: row.id)]
        assert actual == sorted(rows, key=lambda row: encode_key(entity, row))


async def test_atomic_revision_conflict_rolls_back_every_row(adapter):
    one = replace(empty_row("messages", {"sessionId": "s", "messageId": "one"}), revision=1)
    two = replace(empty_row("messages", {"sessionId": "s", "messageId": "two"}), revision=1)
    assert (await adapter.commit([RowPut("messages", one, None)])).ok
    result = await adapter.commit(
        [RowPut("messages", two, None), RowPut("messages", replace(one, revision=2), 8)]
    )
    assert not result.ok
    assert two.id not in await adapter.get("messages", [two.id])
    assert (await adapter.get("messages", [one.id]))[one.id].revision == 1


async def test_foreign_session_and_engine_lease_writes_refused_before_effects(adapter):
    storage = Storage(adapter)
    for op in (
        Upsert("messages", {"sessionId": "foreign", "messageId": "m"}, {}),
        Upsert("leases", {"sessionId": "s"}, {}),
        Upsert(
            "messages",
            {"sessionId": "s", "messageId": "m"},
            {},
            ChatWatermarkGuard("foreign", "c", 1),
        ),
    ):
        with pytest.raises(ValueError):
            await storage.apply(OperationBatch("s", [op]))
    assert not await adapter.get("leases", [encode_key("leases", {"sessionId": "s"})])


async def test_clear_watermark_removes_media_and_all_children_and_blocks_late_copy(adapter):
    storage = Storage(adapter)
    guard = ChatWatermarkGuard("s", "chat", 5)
    await storage.apply(
        OperationBatch(
            "s",
            [
                Upsert(
                    "messages",
                    {"sessionId": "s", "messageId": "m"},
                    {"chatId": FieldWrite("chat", 0), "timestamp": FieldWrite(5, 0)},
                    guard,
                ),
                Upsert(
                    "media",
                    {"sessionId": "s", "messageId": "m"},
                    {"mediaKey": FieldWrite("synthetic", 0)},
                    guard,
                ),
                Upsert(
                    "reactions",
                    {"sessionId": "s", "messageId": "m", "senderId": "sender"},
                    {"timestamp": FieldWrite(5, 0)},
                    guard,
                ),
                Upsert(
                    "receipts",
                    {"sessionId": "s", "messageId": "m", "recipientId": "recipient"},
                    {"timestamp": FieldWrite(5, 0)},
                    guard,
                ),
                Upsert(
                    "poll_votes",
                    {"sessionId": "s", "messageId": "m", "voterId": "voter"},
                    {"timestamp": FieldWrite(5, 0)},
                    guard,
                ),
            ],
        )
    )
    await storage.apply(
        OperationBatch(
            "s",
            [
                Upsert(
                    "chats", {"sessionId": "s", "chatId": "chat"}, {"clearedAt": FieldWrite(10, 10)}
                ),
                ClearChat("s", "chat", 10),
            ],
        )
    )
    assert await storage.get("messages", {"sessionId": "s", "messageId": "m"}) is None
    assert await storage.get("media", {"sessionId": "s", "messageId": "m"}) is None
    for entity in ("reactions", "receipts", "poll_votes"):
        assert not (
            await storage.query(
                entity, IndexQuery("by_message", {"sessionId": "s", "messageId": "m"}, 100)
            )
        ).rows
    await storage.apply(
        OperationBatch(
            "s",
            [
                Upsert(
                    "messages",
                    {"sessionId": "s", "messageId": "m"},
                    {"text": FieldWrite("late", 0)},
                    guard,
                )
            ],
        )
    )
    assert await storage.get("messages", {"sessionId": "s", "messageId": "m"}) is None


async def test_checkpoint_expected_cursor_is_atomic_and_no_lease_generation_reuse(adapter):
    storage = Storage(adapter)
    await storage.apply(
        OperationBatch("s", [Checkpoint("s", "events", "one", expected_cursor=None)])
    )
    first = (await adapter.get("leases", [encode_key("leases", {"sessionId": "s"})])).popitem()[1]
    with pytest.raises(StorageCheckpointConflictError):
        await storage.apply(
            OperationBatch("s", [Checkpoint("s", "events", "two", expected_cursor=None)])
        )
    current = await storage.get_checkpoint("s", "events")
    assert current.cursor == "one"
    second = (await adapter.get("leases", [first.id]))[first.id]
    assert second.revision > first.revision and second.values["owner"] is None


async def test_history_2000_messages_remain_bounded_and_queryable(adapter):
    chunk = copy.deepcopy(FIXTURE["history"])
    template = chunk["conversations"][0]["messages"][0]
    for chat_index, conversation in enumerate(chunk["conversations"]):
        conversation["messages"] = []
        for index in range(100):
            message = copy.deepcopy(template)
            message["message"]["key"]["id"] = f"large-{chat_index}-{index}"
            message["message"]["key"]["remoteJid"] = conversation["id"]
            conversation["messages"].append(message)
    storage = Storage(adapter)
    assert (await storage.apply(reduce_history_chunk("s", chunk, chunk_id="large"))).applied
    total = 0
    for conversation in chunk["conversations"]:
        page = await storage.query(
            "messages",
            IndexQuery("by_chat", {"sessionId": "s", "chatId": "wa:" + conversation["id"]}, 1000),
        )
        total += len(page.rows)
    assert total == 2000


def test_identity_index_separates_same_native_id_by_chat_and_sender_direction():
    index = HistoryIdentityIndex(
        conversations={"one@s.whatsapp.net": "chat-one", "two@s.whatsapp.net": "chat-two"},
        messages=[
            HistoryMessageIdentity("native", "a", "chat-one", False),
            HistoryMessageIdentity("native", "b", "chat-one", True),
            HistoryMessageIdentity("native", "c", "chat-two", False),
        ],
    )
    keys = HistoryKeys(index)
    assert keys.message_id({"id": "native", "fromMe": False}, "one:4@s.whatsapp.net") == "a"
    assert keys.message_id({"id": "native", "fromMe": True}, "one@s.whatsapp.net") == "b"
    assert keys.message_id({"id": "native"}, "two@s.whatsapp.net") == "c"
    assert (
        keys.message_id({"id": "missing", "participant": "sender:3@s.whatsapp.net"}, "group@g.us")
        == "wa:group@g.us:0:sender@s.whatsapp.net:missing"
    )


@pytest.mark.parametrize("reported_conflicts", [True, False])
async def test_failed_earlier_chunk_cannot_write_later_event_marker(reported_conflicts):
    class FailFirst(memory_adapter().__class__):
        capabilities = StorageCapabilities(True, 2)
        failing = True

        async def commit(self, writes):
            if self.failing:
                bad = next(
                    (
                        write
                        for write in writes
                        if isinstance(write, RowPut)
                        and write.entity == "messages"
                        and write.row.values["messageId"] == "bad"
                    ),
                    None,
                )
                if bad is not None:
                    return CommitResult(False, (bad.row.id,) if reported_conflicts else ())
            return await super().commit(writes)

    native = FailFirst()
    storage = Storage(native, max_retries=0)
    batch = OperationBatch(
        "s",
        [
            Upsert(
                "messages",
                {"sessionId": "s", "messageId": message},
                {"text": FieldWrite("body", 0)},
                ChatWatermarkGuard("s", "chat", 1),
            )
            for message in ("bad", "good")
        ],
        event_id="event",
    )
    with pytest.raises(StorageConflictError):
        await storage.apply(batch)
    assert not await storage.has_event("s", "event")
    native.failing = False
    assert (await storage.apply(batch)).applied
    assert await storage.get("messages", {"sessionId": "s", "messageId": "bad"}) is not None


class StreamFixture:
    def __init__(self, storage, *, missing=False, gap=False):
        self.storage, self.missing, self.gap = storage, missing, gap
        self.acks = []
        self.kwargs = None
        self.closed = False

    def stream(self, **kwargs):
        self.kwargs = kwargs

        async def items():
            try:
                if self.gap:
                    kwargs["on_gap"](
                        {"reason": "retention_exceeded", "missedEvents": 1, "requestedCursor": None}
                    )
                event = envelope(FIXTURE["events"][0])
                yield StreamedEvent({}, None if self.missing else event, "cursor-one", "stream", 1)
            finally:
                self.closed = True

        return items()

    async def acknowledge_stream(self, stream_id, cursor, sequence, **kwargs):
        checkpoint = await self.storage.get_checkpoint("*", "events")
        assert checkpoint.cursor == cursor
        assert await self.storage.has_event(
            FIXTURE["events"][0]["session"], FIXTURE["events"][0]["id"]
        )
        self.acks.append((stream_id, cursor, sequence))


async def test_sync_commits_before_checkpoint_and_ack_and_resumes_saved_cursor():
    storage = Storage(memory_adapter())
    source = StreamFixture(storage)
    await sync_to_storage(source, storage).done
    assert source.acks == [("stream", "cursor-one", 1)] and source.closed
    second = StreamFixture(storage)
    await sync_to_storage(second, storage).done
    assert second.kwargs["since"] == "cursor-one" and second.kwargs["manual_ack"] is True


@pytest.mark.parametrize(
    "mode,error", [("missing", StoragePayloadUnavailableError), ("gap", StorageStreamGapError)]
)
async def test_missing_payload_or_gap_never_advances_checkpoint_or_ack(mode, error):
    storage = Storage(memory_adapter())
    source = StreamFixture(storage, missing=mode == "missing", gap=mode == "gap")
    with pytest.raises(error):
        await sync_to_storage(source, storage).done
    assert (
        source.acks == [] and await storage.get_checkpoint("*", "events") is None and source.closed
    )


async def test_immediate_sync_stop_resolves_without_opening_stream():
    storage = Storage(memory_adapter())
    source = StreamFixture(storage)
    sync = sync_to_storage(source, storage)
    sync.stop()
    await sync.done
    assert source.kwargs is None


async def test_d1_independent_signed_handshake_vector(monkeypatch):
    monkeypatch.setattr(os, "urandom", lambda length: bytes(range(length)))

    def handler(request):
        assert request.headers["Polymorfa-Storage-Signature"] == BRIDGE["request"]["signature"]
        assert request.headers["Authorization"] == "Bearer " + BRIDGE["secret"]
        assert "Origin" not in request.headers and "Cookie" not in request.headers
        return httpx.Response(
            200,
            content=BRIDGE["response"]["rawBody"],
            headers={
                "Polymorfa-Storage-Nonce": BRIDGE["nonce"],
                "Polymorfa-Storage-Signature": BRIDGE["response"]["signature"],
            },
        )

    native = await d1_bridge_adapter(
        "https://customer.example",
        BRIDGE["secret"],
        authority=BRIDGE["authority"],
        table_prefix=BRIDGE["tablePrefix"],
        http_transport=httpx.MockTransport(handler),
    )
    assert native.capabilities == StorageCapabilities(True, 50) and BRIDGE["secret"] not in repr(
        native
    )
    await native.close()


@pytest.mark.parametrize(
    "changed",
    [
        "signature",
        "nonce",
        "authority",
        "prefix",
        "schema",
        "atomic",
        "capacity",
        "unsigned_redirect",
    ],
)
async def test_d1_never_advertises_atomicity_before_trusted_handshake(changed):
    native = None

    def handler(request):
        nonce = request.headers["Polymorfa-Storage-Nonce"]
        data = json.loads(BRIDGE["response"]["rawBody"])
        if changed == "authority":
            data["authority"] = "foreign"
        if changed == "prefix":
            data["tablePrefix"] = "foreign_"
        if changed == "schema":
            data["schemaVersion"] = 1
        if changed == "atomic":
            data["data"]["atomicCommit"] = False
        if changed == "capacity":
            data["data"]["maxCommitSize"] = 51
        raw = json.dumps(data, separators=(",", ":")).encode()
        signature = (
            "v1="
            + hmac.new(
                BRIDGE["secret"].encode(), nonce.encode() + b".200." + raw, hashlib.sha256
            ).hexdigest()
        )
        if changed == "signature":
            signature = "v1=" + "0" * 64
        if changed == "nonce":
            nonce = "0" * 43
        if changed == "unsigned_redirect":
            return httpx.Response(302, headers={"location": "https://foreign.example"})
        return httpx.Response(
            200,
            content=raw,
            headers={"Polymorfa-Storage-Nonce": nonce, "Polymorfa-Storage-Signature": signature},
        )

    native = D1BridgeAdapter(
        "https://customer.example",
        BRIDGE["secret"],
        authority=BRIDGE["authority"],
        table_prefix=BRIDGE["tablePrefix"],
        http_transport=httpx.MockTransport(handler),
    )
    assert not native.capabilities.atomic_commit
    with pytest.raises(ServerError):
        await native.handshake()
    assert not native.capabilities.atomic_commit


@pytest.mark.parametrize(
    "secret", ["short", "pmfa_" + "a" * 72, "pmfa_pt_" + "a" * 93 + "A", "pmfa_ct_" + "a" * 40]
)
def test_d1_rejects_wrong_principal_or_short_secret(secret):
    with pytest.raises(ConfigurationError):
        D1BridgeAdapter("https://customer.example", secret, authority="customer")


def test_canonical_numbers_and_utf16_order_match_ecmascript():
    assert (
        canonical_json([1e-7, 1e-6, 1e20, 1e21, 1.0000000000000001e18, -0.0])
        == "[1e-7,0.000001,100000000000000000000,1e+21,1000000000000000100,0]"
    )
    assert canonical_json({"\ufffd": 1, "\U0001f600": 2}) == '{"😀":2,"�":1}'


def test_merge_ties_are_commutative_and_revocation_fields_are_final():
    initial = empty_row("messages", {"sessionId": "s", "messageId": "m"})
    a = {"text": FieldWrite("a", 1)}
    b = {"text": FieldWrite("b", 1)}
    assert merge_fields("messages", merge_fields("messages", initial, a), b) == merge_fields(
        "messages", merge_fields("messages", initial, b), a
    )
    revoked = merge_fields("messages", initial, {"text": FieldWrite(None, 2**53 - 1)})
    assert merge_fields("messages", revoked, b).values["text"] is None
