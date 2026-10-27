"""Opt-in actual pinned Rust service + real Signal core, synthetic accounts only."""

import asyncio
import json
import os
import uuid
from pathlib import Path

import pytest

from polymorfa.signal_node import SIGNAL_NODE_SOURCE_COMMIT, SignalNodeClient


async def test_actual_service_decrypts_receive_and_waits_for_python_manual_ack():
    directory = os.environ.get("POLYMORFA_SIGNAL_NATIVE_FIXTURE")
    if not directory:
        pytest.skip("set POLYMORFA_SIGNAL_NATIVE_FIXTURE to the synthetic actual-service harness")
    fixture = Path(directory)
    metadata = json.loads((fixture / "metadata.json").read_text())
    assert metadata["sourceCommit"] == SIGNAL_NODE_SOURCE_COMMIT and metadata["syntheticOnly"]
    receipt = fixture / "receipt.json"
    receipt.unlink(missing_ok=True)
    identity = "python-native-" + uuid.uuid4().hex
    text = "synthetic Python native Signal proof λ"
    async with SignalNodeClient(metadata["applicationSecret"], base_url=metadata["url"]) as client:
        sessions = await client.list_sessions()
        assert any(item.id == metadata["sessionId"] and item.claimed for item in sessions.sessions)
        async with client.events(session_id=metadata["sessionId"], reconnect=False) as stream:
            iterator = stream.__aiter__()
            receiving = asyncio.create_task(iterator.__anext__())
            try:

                async def wait_open():
                    while stream._response is None:
                        if receiving.done():
                            receiving.result()
                        await asyncio.sleep(0.01)

                await asyncio.wait_for(wait_open(), 5)
                (fixture / "inject.json").write_text(
                    json.dumps({"messageId": identity, "text": text})
                )
                event = await asyncio.wait_for(receiving, 5)
                assert event.session_id == metadata["sessionId"]
                assert event.message_id == identity and event.text == text
                assert event.timestamp == 1720000000 and event.sender_alt == "123456@lid"
                assert event.message_bytes() and not receipt.exists()
                # The caller persists first. Only this explicit request releases Receive.
                saved = fixture / (identity + ".json")
                saved.write_text(json.dumps(event.raw))
                assert json.loads(saved.read_text())["message_id"] == identity
                await client.acknowledge_event(event.id)

                async def wait_receipt():
                    while not receipt.exists():
                        await asyncio.sleep(0.01)

                await asyncio.wait_for(wait_receipt(), 5)
                assert json.loads(receipt.read_text()) == {"acknowledged": True}
            finally:
                receiving.cancel()
                await asyncio.gather(receiving, return_exceptions=True)
