"""Historical MESSAGE_EDIT upserts honor chat.clear/chat.delete watermarks like the TS producer."""

import json
import sqlite3
from pathlib import Path

import pytest

from polymorfa.storage import (
    ClearChat,
    Storage,
    canonical_json,
    encode_key,
    memory_adapter,
    reduce_history_chunk,
    sqlite_adapter,
)
from polymorfa.storage.reduce_events import reduce_event
from polymorfa.webhooks import WebhookEvent

FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/history-edit-guard/fixture.json").read_text(),
    parse_int=float,
)


def wire(op):
    if isinstance(op, ClearChat):
        return {
            "kind": "clearChat",
            "sessionId": op.session_id,
            "chatId": op.chat_id,
            "upTo": op.up_to,
        }
    result = {
        "kind": "upsert",
        "entity": op.entity,
        "key": dict(op.key),
        "fields": {k: {"value": v.value, "version": v.version} for k, v in op.fields.items()},
    }
    if op.guard:
        result["guard"] = {
            "sessionId": op.guard.session_id,
            "chatId": op.guard.chat_id,
            "timestamp": op.guard.timestamp,
        }
    return result


def reduce(step):
    if "history" in step:
        h = step["history"]
        return reduce_history_chunk(h["sessionId"], h["chunk"], chunk_id=h["chunkId"])
    e = step["event"]
    return reduce_event(
        WebhookEvent(e["id"], e["session"], e["timestamp"], e["event"], e["payload"], e, True)
    )


def test_fixture_has_every_case():
    assert len(FIXTURE["cases"]) == 13


@pytest.mark.parametrize("kind", ["memory", "sqlite"])
@pytest.mark.parametrize("case", FIXTURE["cases"], ids=lambda c: c["name"])
async def test_history_edit_guard_matches_producer(kind, case):
    connection = sqlite3.connect(":memory:") if kind == "sqlite" else None
    adapter = memory_adapter() if connection is None else sqlite_adapter(connection)
    await adapter.setup()
    storage = Storage(adapter)
    try:
        mismatches = []
        for i, step in enumerate(case["steps"]):
            batch = reduce(step)
            if [wire(op) for op in batch.operations] != step["operations"]:
                mismatches.append(i)
            assert (await storage.apply(batch)).applied == step["applied"], i
        for expected in case["expect"]:
            row = await storage.get(expected["entity"], expected["key"])
            assert (None if row is None else row.get("text")) == expected["text"]
        assert mismatches == []
        for entity, rows in case["rows"].items():
            got = await adapter.get(entity, [encode_key(entity, r) for r in rows])
            assert sorted(canonical_json(r.values) for r in got.values()) == sorted(
                canonical_json(r) for r in rows
            )
    finally:
        await adapter.close()
        if connection is not None:
            connection.close()
