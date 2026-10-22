import copy
import json
import os
import secrets
from dataclasses import replace
from pathlib import Path

import pytest

from polymorfa.storage import IndexQuery, RowDelete, RowPut, Storage, encode_key
from polymorfa.storage.core import empty_row
from polymorfa.storage.dynamodb import dynamodb_adapter
from polymorfa.storage.firestore import firestore_adapter
from polymorfa.storage.mongodb import mongodb_adapter
from polymorfa.storage.reduce_events import reduce_event
from polymorfa.storage.reduce_history import reduce_history_chunk
from polymorfa.webhooks import WebhookEvent

ROOT = Path(__file__).resolve().parents[3]
FIXTURE = json.loads((ROOT / "packages/storage/conformance-fixtures.json").read_text())


@pytest.fixture(params=["mongodb", "dynamodb", "firestore"])
async def native_document(request):
    if not os.environ.get("POLYMORFA_TEST_NATIVE_DOCUMENT"):
        pytest.skip("Requires application-owned document database fixtures and optional drivers")
    namespace = "python_" + secrets.token_hex(8)
    if request.param == "mongodb":
        from pymongo import AsyncMongoClient

        client = AsyncMongoClient(
            "mongodb://127.0.0.1:"
            + os.environ["POLYMORFA_TEST_MONGO_PORT"]
            + "/?directConnection=true",
            serverSelectionTimeoutMS=5000,
        )
        native = mongodb_adapter(client, client.storage, namespace=namespace)
    elif request.param == "dynamodb":
        import aioboto3

        manager = aioboto3.Session().client(
            "dynamodb",
            endpoint_url="http://127.0.0.1:" + os.environ["POLYMORFA_TEST_DYNAMO_PORT"],
            region_name="us-east-1",
            aws_access_key_id="synthetic",
            aws_secret_access_key="synthetic",
        )
        client = await manager.__aenter__()
        native = dynamodb_adapter(
            client, namespace=namespace, table_name=namespace, create_table=True
        )
    else:
        from google.auth.credentials import AnonymousCredentials
        from google.cloud.firestore_v1 import AsyncClient

        client = AsyncClient(project="polymorfa-python-fixture", credentials=AnonymousCredentials())
        native = firestore_adapter(client, namespace=namespace)
    await native.setup()
    yield native
    await native.close()
    if request.param == "mongodb":
        await client.close()
    elif request.param == "dynamodb":
        await manager.__aexit__(None, None, None)
    else:
        client.close()


@pytest.mark.parametrize("kind", ["events", "history"])
async def test_actual_document_schema2_fixtures_replay(native_document, kind):
    storage = Storage(native_document)
    if kind == "events":
        for value in FIXTURE["events"]:
            event = WebhookEvent(
                value["id"],
                value["session"],
                value["timestamp"],
                value["event"],
                value["payload"],
                value,
                True,
            )
            await storage.apply(reduce_event(event))
        expected = FIXTURE["eventRows"]
    else:
        batch = reduce_history_chunk("portable-fixture", FIXTURE["history"], chunk_id="chunk")
        assert (await storage.apply(batch)).applied
        assert not (await storage.apply(batch)).applied
        expected = FIXTURE["historyRows"]
    for entity, rows in expected.items():
        current = await native_document.get(entity, [encode_key(entity, row) for row in rows])
        assert [row.values for row in sorted(current.values(), key=lambda row: row.id)] == sorted(
            rows, key=lambda row: encode_key(entity, row)
        )


async def test_actual_document_conditional_rollback_delete_and_namespace(native_document):
    one = replace(empty_row("messages", {"sessionId": "s", "messageId": "one"}), revision=1)
    two = replace(empty_row("messages", {"sessionId": "s", "messageId": "two"}), revision=1)
    assert (await native_document.commit([RowPut("messages", one, None)])).ok
    failed = await native_document.commit(
        [RowPut("messages", two, None), RowPut("messages", replace(one, revision=2), 8)]
    )
    assert not failed.ok and two.id not in await native_document.get("messages", [two.id])
    assert (await native_document.get("messages", [one.id]))[one.id].revision == 1
    failed = await native_document.commit([RowDelete("messages", one.id, 9)])
    assert not failed.ok
    assert (await native_document.commit([RowDelete("messages", one.id, 1)])).ok
    assert not await native_document.get("messages", [one.id])
    assert (await native_document.commit([RowPut("messages", one, None)])).ok
    assert (
        len(
            await native_document.query(
                "messages", IndexQuery("by_chat", {"sessionId": "foreign", "chatId": "chat"}, 10)
            )
        )
        == 0
    )


async def test_actual_document_history_2000(native_document):
    chunk = copy.deepcopy(FIXTURE["history"])
    template = chunk["conversations"][0]["messages"][0]
    for chat_index, conversation in enumerate(chunk["conversations"]):
        conversation["messages"] = []
        for index in range(100):
            message = copy.deepcopy(template)
            message["message"]["key"]["id"] = f"large-{chat_index}-{index}"
            message["message"]["key"]["remoteJid"] = conversation["id"]
            conversation["messages"].append(message)
    storage = Storage(native_document)
    assert (await storage.apply(reduce_history_chunk("s", chunk, chunk_id="large"))).applied
    total = 0
    for conversation in chunk["conversations"]:
        page = await storage.query(
            "messages",
            IndexQuery("by_chat", {"sessionId": "s", "chatId": "wa:" + conversation["id"]}, 1000),
        )
        total += len(page.rows)
    assert total == 2000
