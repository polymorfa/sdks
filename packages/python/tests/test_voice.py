import asyncio
import json

import httpx
import pytest

from polymorfa import (
    AsyncClient,
    AsyncProjectClient,
    AuthorizationError,
    ConfigurationError,
    Credential,
    NotFoundError,
    RequestOptions,
    TimeoutError,
    ValidationError,
)

PROJECT = "project_1"
NOW = "2026-10-11T00:00:00Z"
ASSET = {
    "id": "asset_1",
    "projectId": PROJECT,
    "name": "Greeting",
    "source": "tts",
    "status": "ready",
    "failureReason": None,
    "originalFormat": "ogg",
    "originalContentType": "audio/ogg",
    "sizeBytes": 100,
    "durationMs": 2000.5,
    "contentSha256": "a" * 64,
    "tts": {
        "provider": "openai",
        "voiceId": "coral",
        "model": "gpt-4o-mini-tts",
        "text": "Hello",
        "characters": 5,
        "keySource": "customer",
        "credentialId": "credential_1",
    },
    "retentionDays": None,
    "expiresAt": None,
    "inUseCount": 0,
    "revision": 1,
    "createdAt": NOW,
    "updatedAt": NOW,
    "readyAt": NOW,
    "future": True,
}
CREDENTIAL = {
    "id": "credential_1",
    "projectId": PROJECT,
    "provider": "openai",
    "label": "Example",
    "keyFingerprint": "deadbeef",
    "status": "valid",
    "verifiedAt": NOW,
    "lastError": None,
    "revision": 1,
    "createdAt": NOW,
    "updatedAt": NOW,
}
UPLOAD = {
    "url": "https://storage.example.invalid/upload?secret=fixture",
    "method": "POST",
    "headers": {"x-upload-token": "fixture", "Authorization": "must_strip"},
    "maxBytes": 16777216,
    "expiresAt": NOW,
}
CREATE = {"name": "Greeting", "contentType": "audio/ogg", "sizeBytes": 100, "retentionDays": 30}
SYNTH = {
    "name": "Greeting",
    "text": "Hello",
    "provider": "openai",
    "voiceId": "coral",
    "model": "gpt-4o-mini-tts",
    "credentialId": "credential_1",
    "retentionDays": 30,
}
AP = "/platform/voice/audio"
CP = "/platform/voice/provider-credentials"
CASES = [
    (
        "audio.list",
        "GET",
        AP,
        None,
        {"projectId": PROJECT, "status": "ready", "cursor": "cursor_1", "limit": 10},
        [ASSET],
        lambda v, o: v.audio.list(
            {"status": "ready", "cursor": "cursor_1", "limit": 10}, project_id=PROJECT, options=o
        ),
    ),
    (
        "audio.create_upload",
        "POST",
        AP,
        {**CREATE, "projectId": PROJECT},
        {},
        {"asset": ASSET, "upload": UPLOAD},
        lambda v, o: v.audio.create_upload(CREATE, project_id=PROJECT, options=o),
    ),
    (
        "audio.synthesize",
        "POST",
        AP + "/tts",
        {**SYNTH, "projectId": PROJECT},
        {},
        ASSET,
        lambda v, o: v.audio.synthesize(SYNTH, project_id=PROJECT, options=o),
    ),
    (
        "audio.retrieve",
        "GET",
        AP + "/asset_1",
        None,
        {},
        ASSET,
        lambda v, o: v.audio.retrieve("asset_1", options=o),
    ),
    (
        "audio.complete",
        "POST",
        AP + "/asset_1/complete",
        None,
        {},
        ASSET,
        lambda v, o: v.audio.complete("asset_1", options=o),
    ),
    (
        "audio.update",
        "PATCH",
        AP + "/asset_1",
        {"expectedRevision": 1, "retentionDays": None},
        {},
        ASSET,
        lambda v, o: v.audio.update(
            "asset_1", {"expectedRevision": 1, "retentionDays": None}, options=o
        ),
    ),
    (
        "audio.delete",
        "DELETE",
        AP + "/asset_1",
        None,
        {},
        {"id": "asset_1", "deleted": True},
        lambda v, o: v.audio.delete("asset_1", options=o),
    ),
    (
        "audio.preview_url",
        "GET",
        AP + "/asset_1/preview",
        None,
        {},
        {"url": "https://example.invalid/preview", "contentType": "audio/ogg", "expiresAt": NOW},
        lambda v, o: v.audio.preview_url("asset_1", options=o),
    ),
    (
        "provider_credentials.list",
        "GET",
        CP,
        None,
        {"projectId": PROJECT},
        [CREDENTIAL],
        lambda v, o: v.provider_credentials.list(project_id=PROJECT, options=o),
    ),
    (
        "provider_credentials.create",
        "POST",
        CP,
        {
            "provider": "openai",
            "label": "Example",
            "apiKey": "fixture_only_key",
            "projectId": PROJECT,
        },
        {},
        CREDENTIAL,
        lambda v, o: v.provider_credentials.create(
            {"provider": "openai", "label": "Example", "apiKey": "fixture_only_key"},
            project_id=PROJECT,
            options=o,
        ),
    ),
    (
        "provider_credentials.retrieve",
        "GET",
        CP + "/credential_1",
        None,
        {},
        CREDENTIAL,
        lambda v, o: v.provider_credentials.retrieve("credential_1", options=o),
    ),
    (
        "provider_credentials.verify",
        "POST",
        CP + "/credential_1/verify",
        None,
        {},
        CREDENTIAL,
        lambda v, o: v.provider_credentials.verify("credential_1", options=o),
    ),
    (
        "provider_credentials.delete",
        "DELETE",
        CP + "/credential_1",
        None,
        {},
        {"id": "credential_1", "deleted": True},
        lambda v, o: v.provider_credentials.delete("credential_1", options=o),
    ),
]


@pytest.mark.parametrize("scope", ["organization", "project-team-key", "project-token"])
@pytest.mark.parametrize("case", CASES)
async def test_voice_public_typed_methods_and_project_ownership(scope, case):
    name, method, path, body, query, value, invoke = case
    requests = []
    preflight = scope == "project-team-key" and name in {
        "audio.complete",
        "audio.update",
        "audio.delete",
        "audio.preview_url",
        "provider_credentials.verify",
        "provider_credentials.delete",
    }

    def handler(request):
        requests.append(request)
        if preflight and len(requests) == 1:
            assert request.method == "GET" and "idempotency-key" not in request.headers
            return httpx.Response(
                200, json={"data": CREDENTIAL if name.startswith("provider") else ASSET}
            )
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == {key: str(v) for key, v in query.items()}
        assert (json.loads(request.content) if request.content else None) == body
        assert (
            request.headers["idempotency-key"] == "explicit_key"
            and request.headers["x-proof"] == "voice"
        )
        payload = {"data": value}
        if name == "audio.list":
            payload["page"] = {"nextCursor": None, "hasMore": False}
        return httpx.Response(200, json=payload, headers={"x-request-id": "req_voice"})

    credential = (
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A")
        if scope == "project-token"
        else Credential("organization_api_key", "pmfa_" + "a" * 72)
    )
    cls = AsyncProjectClient if scope == "project-token" else AsyncClient
    args = (credential, PROJECT) if scope == "project-token" else (credential,)
    async with cls(*args, http_transport=httpx.MockTransport(handler)) as client:
        target = client.project(PROJECT) if scope == "project-team-key" else client
        result = await invoke(
            target.voice,
            RequestOptions(idempotency_key="explicit_key", headers={"x-proof": "voice"}),
        )
        if name == "audio.list":
            assert result.items == tuple(value)
            result = result.response
        assert result.data == (
            {"data": value, "page": {"nextCursor": None, "hasMore": False}}
            if name == "audio.list"
            else value
        )
        assert result.metadata.request_id == "req_voice"
    assert len(requests) == (2 if preflight else 1)


@pytest.mark.parametrize("resource", ["audio", "provider_credentials"])
@pytest.mark.parametrize("method", ["retrieve", "delete"])
async def test_foreign_voice_resource_never_exposes_or_changes(resource, method):
    requests = []

    def handler(request):
        requests.append(request)
        value = CREDENTIAL if resource == "provider_credentials" else ASSET
        return httpx.Response(200, json={"data": {**value, "projectId": "project_other"}})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        r = getattr(client.project(PROJECT).voice, resource)
        with pytest.raises(NotFoundError) as caught:
            await getattr(r, method)("id_1")
        assert caught.value.status == 404
    assert len(requests) == 1 and requests[0].method == "GET"


async def test_project_can_read_team_provider_key_but_never_manage_it():
    requests = []

    def handler(request):
        requests.append(request)
        return httpx.Response(200, json={"data": {**CREDENTIAL, "projectId": None}})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        r = client.project(PROJECT).voice.provider_credentials
        assert (await r.retrieve("credential_1")).data["projectId"] is None
        for method in [r.verify, r.delete]:
            with pytest.raises(AuthorizationError):
                await method("credential_1")
    assert all(request.method == "GET" for request in requests)


async def test_team_wide_credentials_and_unknown_server_enum_preservation():
    def handler(request):
        assert not request.url.params
        if request.method == "POST":
            assert "projectId" not in json.loads(request.content)
        return httpx.Response(
            200,
            json={
                "data": [{**CREDENTIAL, "provider": "future_provider", "status": "future_status"}]
                if request.method == "GET"
                else CREDENTIAL
            },
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        assert (await client.voice.provider_credentials.list()).data[0][
            "provider"
        ] == "future_provider"
        await client.voice.provider_credentials.create(
            {"provider": "openai", "label": "Example", "apiKey": "fixture_only_key"}
        )


async def test_upload_capability_isolation_and_followup_key():
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.host == "storage.example.invalid":
            assert request.content == b"audio" and request.method == "POST"
            assert (
                "authorization" not in request.headers
                and "polymorfa-version" not in request.headers
                and "idempotency-key" not in request.headers
                and "x-proof" not in request.headers
            )
            assert request.headers["x-upload-token"] == "fixture"
            return httpx.Response(204)
        if request.url.path == AP:
            assert json.loads(request.content) == {
                "name": "Greeting",
                "contentType": "audio/ogg",
                "sizeBytes": 5,
                "projectId": PROJECT,
                "retentionDays": 30,
            }
            assert request.headers["idempotency-key"] == "create_key"
            return httpx.Response(200, json={"data": {"asset": ASSET, "upload": UPLOAD}})
        assert (
            request.url.path == AP + "/asset_1/complete"
            and "idempotency-key" not in request.headers
        )
        return httpx.Response(200, json={"data": {**ASSET, "status": "transcoding"}})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.voice.audio.upload(
            "Greeting",
            b"audio",
            "audio/ogg",
            project_id=PROJECT,
            retention_days=30,
            options=RequestOptions(
                idempotency_key="create_key", headers={"x-proof": "never_storage"}
            ),
        )
        assert result.data["status"] == "transcoding"
    assert len(requests) == 3


@pytest.mark.parametrize("kind", ["redirect", "failure", "network", "timeout"])
async def test_storage_errors_sanitized_never_retry_or_complete(kind):
    requests = []

    def handler(request):
        requests.append(request)
        if request.url.path == AP:
            return httpx.Response(200, json={"data": {"asset": ASSET, "upload": UPLOAD}})
        if kind == "network":
            raise httpx.ConnectError("secret_url=" + UPLOAD["url"])
        if kind == "timeout":
            raise httpx.ReadTimeout("secret_url=" + UPLOAD["url"])
        return httpx.Response(
            302 if kind == "redirect" else 503,
            text=UPLOAD["url"],
            headers={"location": UPLOAD["url"], "x-request-id": UPLOAD["url"]},
        )

    from polymorfa import PolymorfaError

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(PolymorfaError) as caught:
            await client.voice.audio.upload(
                "Greeting",
                b"audio",
                "audio/ogg",
                project_id=PROJECT,
                options=RequestOptions(max_network_retries=2),
            )
        assert (
            "secret=fixture" not in str(caught.value)
            and caught.value.metadata is None
            and caught.value.__cause__ is None
        )
    assert len(requests) == 2


async def test_upload_preflight_and_project_rebinding_guard():
    requests = []
    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(lambda request: requests.append(request)),
    ) as client:
        with pytest.raises(ValidationError):
            await client.voice.audio.upload(
                "Greeting", b"audio", "audio/ogg", size_bytes=4, project_id=PROJECT
            )
        with pytest.raises(ValidationError):
            await client.voice.audio.upload("Greeting", b"audio", "text/plain", project_id=PROJECT)
        with pytest.raises(ConfigurationError):
            await client.voice.audio.list()
        with pytest.raises(ConfigurationError):
            await client.project(PROJECT).voice.audio.list(project_id="foreign")
        with pytest.raises(ConfigurationError):
            await client.voice.provider_credentials.create(
                {"provider": "openai", "label": "x", "apiKey": ""}
            )
    assert not requests


async def test_wait_ready_failed_deadline_and_task_cancellation():
    counter = 0

    async def handler(request):
        nonlocal counter
        counter += 1
        return httpx.Response(
            200,
            json={
                "data": {
                    **ASSET,
                    "status": "transcoding" if counter == 1 else "failed",
                    "failureReason": "tts_failed",
                }
            },
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.voice.audio.wait_until_ready("asset_1", timeout=1, interval=0.001)
        assert result.data["status"] == "failed" and counter == 2
    admitted = asyncio.Event()
    cancelled = asyncio.Event()

    async def pending(request):
        admitted.set()
        try:
            await asyncio.Future()
        finally:
            cancelled.set()

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(pending),
    ) as client:
        with pytest.raises(TimeoutError):
            await client.voice.audio.wait_until_ready("asset_1", timeout=0.01)
        assert cancelled.is_set()
        admitted.clear()
        cancelled.clear()
        task = asyncio.create_task(client.voice.audio.wait_until_ready("asset_1"))
        await admitted.wait()
        task.cancel()
        with pytest.raises(asyncio.CancelledError):
            await task
        assert cancelled.is_set()


async def test_upload_stream_requires_declared_size_and_transmits_once():
    async def body():
        yield b"au"
        yield b"dio"

    seen = []

    def handler(request):
        seen.append(request)
        if request.url.path == AP:
            return httpx.Response(200, json={"data": {"asset": ASSET, "upload": UPLOAD}})
        if request.url.host == "storage.example.invalid":
            assert request.content == b"audio"
            return httpx.Response(200)
        return httpx.Response(200, json={"data": ASSET})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ConfigurationError):
            await client.voice.audio.upload("Greeting", body(), "audio/ogg", project_id=PROJECT)
        await client.voice.audio.upload(
            "Greeting", body(), "audio/ogg", size_bytes=5, project_id=PROJECT
        )
    assert len(seen) == 3
