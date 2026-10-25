import asyncio
import json
from pathlib import Path

import httpx
import pytest

from polymorfa import AsyncMessagingClient, Credential, ValidationError

FIXTURE = json.loads(
    (Path(__file__).parents[3] / "contracts/fixtures/calls-coverage-end.candidate.json").read_text()
)


def test_call_settings_coverage_end_response_only():
    asyncio.run(_coverage_end())


async def _coverage_end():
    for case in FIXTURE["cases"]:
        for method in ("GET", "PUT"):
            settings = {
                **FIXTURE["settings"],
                "simultaneousCalls": case["on"],
                "simultaneousCallsCoverageExcludedUntil": case["until"],
            }

            def handler(request, method=method, settings=settings):
                assert request.method == method
                assert request.url.path == "/platform/sessions/support/call-settings"
                if method == "PUT":
                    assert json.loads(request.content) == {"callsEnabled": False}
                return httpx.Response(200, json={"success": True, "data": settings})

            async with AsyncMessagingClient(
                credential=Credential(
                    "organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"
                ),
                http_transport=httpx.MockTransport(handler),
            ) as client:
                result = (
                    await client.voip.retrieve_call_settings("support")
                    if method == "GET"
                    else await client.voip.update_call_settings("support", {"callsEnabled": False})
                )
                assert (
                    result.data["data"]["simultaneousCallsCoverageExcludedUntil"] == case["until"]
                )
                assert result.data["data"] == settings
                with pytest.raises(ValidationError):
                    await client.voip.update_call_settings(
                        "support", {"simultaneousCallsCoverageExcludedUntil": case["until"]}
                    )


def test_call_settings_older_response_absence():
    asyncio.run(_older_response())


async def _older_response():
    async with AsyncMessagingClient(
        credential=Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
        http_transport=httpx.MockTransport(
            lambda _: httpx.Response(200, json={"success": True, "data": FIXTURE["settings"]})
        ),
    ) as client:
        assert (
            "simultaneousCallsCoverageExcludedUntil"
            not in (await client.voip.retrieve_call_settings("support")).data["data"]
        )


def test_call_settings_reject_response_only_and_unknown_keys():
    asyncio.run(_reject_extra_keys())


async def _reject_extra_keys():
    sent = []
    async with AsyncMessagingClient(
        credential=Credential("organization_api_key", "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"),
        http_transport=httpx.MockTransport(
            lambda request: sent.append(request) or httpx.Response(200, json={})
        ),
    ) as client:
        for extra in (
            {"simultaneousCallsCoverageExcludedUntil": None},
            {"simultaneousCallsCoverageExcludedUntil": "2026-11-22T12:34:56.789Z"},
            {"unknownSetting": True},
        ):
            with pytest.raises(ValidationError):
                await client.voip.update_call_settings("support", {"callsEnabled": False, **extra})
    assert sent == []
