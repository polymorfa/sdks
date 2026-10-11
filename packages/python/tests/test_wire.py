from __future__ import annotations

import asyncio
import json
import subprocess
from pathlib import Path

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential, PolymorfaError, RequestOptions

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = json.loads((ROOT / "contracts/fixtures/behavior.json").read_text())


@pytest.fixture(scope="module")
def fixture_url():
    process = subprocess.Popen(
        ["node", str(ROOT / "scripts/sdk-fixture-server.mjs"), "--port", "0"],
        stdout=subprocess.PIPE,
        text=True,
    )
    assert process.stdout is not None
    url = json.loads(process.stdout.readline())["url"]
    try:
        yield url
    finally:
        process.terminate()
        process.wait(timeout=10)


@pytest.mark.parametrize("scenario", FIXTURES["scenarios"], ids=lambda s: s["id"])
async def test_shared_wire_scenario(fixture_url, scenario):
    request, outcome = scenario["request"], scenario["outcome"]
    options = RequestOptions(
        headers={"x-polymorfa-fixture": scenario["id"]},
        idempotency_key=request["headers"].get("idempotency-key"),
        api_version=request["headers"].get("polymorfa-version"),
        max_network_retries=outcome.get("maxNetworkRetries"),
        timeout=outcome.get("timeoutMs", 30000) / 1000,
    )
    async with httpx.AsyncClient() as admin:
        await admin.post(fixture_url + "/__fixtures/" + scenario["id"] + "/reset")
        async with AsyncMessagingClient(
            Credential("organization_api_key", FIXTURES["organizationCredential"]),
            base_url=fixture_url,
        ) as client:

            async def run():
                if scenario["id"] == "sessions-list":
                    result = await client.sessions.list(options=options)
                    assert result.data["data"][0]["sessionId"] == "session_fixture"
                    return result
                if scenario["id"] == "message-send":
                    result = await client.messages.send("support", request["body"], options=options)
                    assert result.data["data"]["id"] == "msg_fixture"
                    return result
                return await client.raw.request(
                    request["method"],
                    request["path"],
                    query=request.get("query"),
                    body=request.get("body"),
                    options=options,
                )

            if outcome.get("error") == "cancelled":
                task = asyncio.create_task(run())

                async def wait_for_admission():
                    while True:
                        admitted = (
                            await admin.get(
                                fixture_url + "/__fixtures/" + scenario["id"] + "/state"
                            )
                        ).json()
                        if admitted["attempts"] > 0:
                            return
                        if task.done():
                            await task
                            pytest.fail("Request finished before cancellation fixture admission.")

                try:
                    await asyncio.wait_for(wait_for_admission(), timeout=10)
                except BaseException:
                    task.cancel()
                    await asyncio.gather(task, return_exceptions=True)
                    raise
                task.cancel()
                with pytest.raises(asyncio.CancelledError):
                    await task
            elif outcome.get("error"):
                with pytest.raises(PolymorfaError) as caught:
                    await run()
                assert caught.value.code == outcome.get("code", caught.value.code)
                if "metadataRequestId" in outcome:
                    assert caught.value.metadata.request_id == outcome["metadataRequestId"]
                if "operationId" in outcome:
                    assert caught.value.metadata.operation_id == outcome["operationId"]
                if "requestId" in outcome:
                    assert caught.value.request_id == outcome["requestId"]
                    assert caught.value.metadata.request_id == outcome["metadataRequestId"]
                if scenario["id"] == "html-error":
                    assert "<html>" not in str(caught.value)
            else:
                response = await run()
                assert response.metadata.attempts == outcome["attempts"]
                if "data" in outcome:
                    assert response.data == outcome["data"]
                assert response.metadata.status == scenario["responses"][-1]["status"]
            state = (
                await admin.get(fixture_url + "/__fixtures/" + scenario["id"] + "/state")
            ).json()
            assert state["attempts"] == outcome["attempts"]
            assert state["mismatches"] == []
