"""Unchanged TypeScript producer oracle through public reducers and real adapters."""

import json
import sqlite3
import struct
from dataclasses import replace
from pathlib import Path

import pytest

from polymorfa.storage import (
    ClearChat,
    FieldWrite,
    OperationBatch,
    RowPut,
    Storage,
    Upsert,
    canonical_json,
    encode_key,
    memory_adapter,
    reduce_history_chunk,
    sqlite_adapter,
)
from polymorfa.storage.core import empty_row

# Producer JSON numbers are binary64, including integral tokens above 2**53.
FIXTURE = json.loads(
    (Path(__file__).parent / "fixtures/numeric-storage/fixture.json").read_text(), parse_int=float
)


def test_public_numeric_strings_match_producer_bits():
    for vector in FIXTURE["strings"]:
        batch = reduce_history_chunk(
            "numeric", {"syncType": 3, "chunkOrder": 16, "progress": vector["input"]}
        )
        op = next(
            op
            for op in batch.operations
            if isinstance(op, Upsert) and op.entity == "history_progress"
        )
        value = op.fields.get("progress")
        actual = struct.pack(">d", value.value).hex() if value else None
        assert actual == vector["bits"], repr(vector["input"])


def wire(op):
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


@pytest.mark.parametrize("kind", ["memory", "sqlite"])
@pytest.mark.parametrize("history", FIXTURE["histories"], ids=lambda h: h["name"])
async def test_public_numeric_storage_rows_replay_and_watermarks(kind, history):
    connection = sqlite3.connect(":memory:") if kind == "sqlite" else None
    adapter = memory_adapter() if connection is None else sqlite_adapter(connection)
    await adapter.setup()
    storage = Storage(adapter)

    async def assert_rows(expected):
        for entity, rows in expected.items():
            keys = {encode_key(entity, r) for r in rows}
            # Include original keys to observe deletion, not just expected survivors.
            keys.update(encode_key(entity, r) for r in history["rows"][entity])
            got = await adapter.get(entity, list(keys))
            assert sorted(canonical_json(r.values) for r in got.values()) == sorted(
                canonical_json(r) for r in rows
            )
            if kind == "memory":
                assert len(await adapter.rows(entity)) == len(rows)

    try:
        batch = reduce_history_chunk("numeric", history["chunk"], chunk_id=history["name"])
        assert [wire(op) for op in batch.operations] == history["operations"]
        assert (await storage.apply(batch)).applied
        await assert_rows(history["rows"])
        assert not (await storage.apply(batch)).applied
        for i, cleanup in enumerate(history["cleanup"]):
            operations = []
            for op in cleanup["operations"]:
                if op["kind"] == "clearChat":
                    operations.append(ClearChat(op["sessionId"], op["chatId"], op["upTo"]))
                else:
                    operations.append(
                        Upsert(
                            op["entity"],
                            op["key"],
                            {
                                k: FieldWrite(v["value"], v["version"])
                                for k, v in op["fields"].items()
                            },
                        )
                    )
            await storage.apply(OperationBatch("numeric", operations))
            await storage.apply(replace(batch, event_id=f"late:{i}"))
            await assert_rows(cleanup["rows"])
    finally:
        await adapter.close()
        if connection is not None:
            connection.close()


async def test_numeric_strings_do_not_relax_generic_rows_or_revisions():
    adapter = memory_adapter()
    storage = Storage(adapter)
    with pytest.raises((ValueError, TypeError)):
        await storage.apply(
            OperationBatch(
                "numeric",
                [
                    Upsert(
                        "messages",
                        {"sessionId": "numeric", "messageId": "strict"},
                        {"timestamp": FieldWrite("16", 1)},
                    )
                ],
            )
        )
    row = empty_row("messages", {"sessionId": "numeric", "messageId": "strict"})
    for revision in ["16", True, 0, -1, 1.5, 2**53, float("inf")]:
        with pytest.raises((ValueError, TypeError)):
            await adapter.commit([RowPut("messages", replace(row, revision=revision), None)])
