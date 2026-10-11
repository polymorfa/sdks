import json

import httpx
import pytest

from polymorfa import AsyncClient, Credential

SETTINGS = {
    "id": "settings_1",
    "projectId": None,
    "enabled": True,
    "successCallbackUrl": None,
    "failureCallbackUrl": None,
    "businessName": "Example",
    "headline": None,
    "description": None,
    "successMessage": None,
    "supportUrl": None,
    "privacyUrl": None,
    "termsUrl": None,
    "accent": None,
    "theme": "system",
    "hideWatermark": False,
    "allowPhoneChange": False,
    "shape": None,
    "radiusPx": None,
    "logoMode": "none",
    "logoStorageId": None,
    "logoSourceStorageId": None,
    "logoUrl": None,
    "historySync": "ask",
    "methods": None,
    "defaultMethod": None,
    "createdAt": 1,
    "updatedAt": 2,
}
OPT_OUT = {
    "enabled": True,
    "optOutKeywords": ["STOP", "UNSUBSCRIBE"],
    "optInKeywords": ["START"],
    "updatedAt": None,
}
INPUT = {k: OPT_OUT[k] for k in ["enabled", "optOutKeywords", "optInKeywords"]}
CASES = [
    (
        "GET",
        "/platform/optouts",
        None,
        {"entries": [{"phone": "+15551234567", "future": True}]},
        lambda r: r.list(),
    ),
    (
        "POST",
        "/platform/optouts",
        {"phone": "+15551234567", "note": "Request"},
        {"created": True, "future": {"retained": True}},
        lambda r: r.create({"phone": "+15551234567", "note": "Request"}),
    ),
    (
        "POST",
        "/platform/optouts/batch",
        {"phones": ["+15551234567"]},
        {"created": 1},
        lambda r: r.create_batch({"phones": ["+15551234567"]}),
    ),
    (
        "DELETE",
        "/platform/optouts/+15551234567",
        None,
        {"removed": True},
        lambda r: r.delete("+15551234567"),
    ),
    ("GET", "/platform/optouts/settings", None, OPT_OUT, lambda r: r.get_settings()),
    ("PUT", "/platform/optouts/settings", INPUT, OPT_OUT, lambda r: r.update_settings(INPUT)),
]


@pytest.mark.parametrize("method,path,body,data,invoke", CASES)
async def test_typed_keyword_settings_and_opaque_optouts(method, path, body, data, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert (json.loads(request.content) if request.content else None) == body
        return httpx.Response(200, json={"data": data}, headers={"x-request-id": "req_settings"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client.opt_outs)
        assert result.data == {"data": data} and result.metadata.request_id == "req_settings"
        assert result.metadata.status == 200


@pytest.mark.parametrize("project_id", [None, "project_1"])
@pytest.mark.parametrize("write", [False, True])
@pytest.mark.parametrize("missing", [False, True])
async def test_quicklink_settings_owner_body_and_nullable_read(project_id, write, missing):
    update = {
        "enabled": False,
        "successCallbackUrl": "https://example.com/success",
        "failureCallbackUrl": None,
        "theme": "dark",
        "methods": ["qr", "pairing"],
        "defaultMethod": "pairing",
        "allowPhoneChange": True,
    }
    data = None if missing and not write else SETTINGS | {"projectId": project_id}

    def handler(request):
        assert request.url.path == "/platform/quicklink"
        if write:
            assert request.method == "PUT" and not request.url.query
            assert json.loads(request.content) == update | (
                {"projectId": project_id} if project_id else {}
            )
        else:
            assert request.method == "GET" and not request.content
            assert dict(request.url.params) == ({"projectId": project_id} if project_id else {})
        return httpx.Response(200, json={"data": data}, headers={"x-request-id": "req_quicklink"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        resource = (client.project(project_id) if project_id else client).quick_link_settings
        result = await resource.update(update) if write else await resource.retrieve()
        assert result.data == data and result.metadata.request_id == "req_quicklink"
        assert result.metadata.status == 200


async def test_quicklink_project_context_cannot_be_replaced():
    def handler(request):
        assert json.loads(request.content) == {"projectId": "project_1", "enabled": True}
        return httpx.Response(200, json={"data": SETTINGS | {"projectId": "project_1"}})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.project("project_1").quick_link_settings.update(
            {"projectId": "project_other", "enabled": True}
        )
        assert result.data["projectId"] == "project_1"
