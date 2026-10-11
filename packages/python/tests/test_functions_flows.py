import json

import httpx
import pytest

from polymorfa import (
    AsyncClient,
    AsyncProjectClient,
    ConfigurationError,
    Credential,
    RequestOptions,
    ServerError,
    ValidationError,
)

PROJECT = "00000000-0000-4000-8000-000000000001"
FUNCTION = "00000000-0000-4000-8000-000000000002"
DEPLOYMENT = "00000000-0000-4000-8000-000000000003"
VERSION = "00000000-0000-4000-8000-000000000004"
INVOCATION = "00000000-0000-4000-8000-000000000005"
FLOW = "00000000-0000-4000-8000-000000000006"
NOW = "2026-10-11T00:00:00Z"
F = {
    "id": FUNCTION,
    "projectId": PROJECT,
    "name": "Support",
    "enabled": True,
    "revision": 2,
    "activeDeploymentId": DEPLOYMENT,
    "createdAt": NOW,
    "updatedAt": NOW,
    "future": True,
}
CREATEDEPLOY = {
    "deploymentId": DEPLOYMENT,
    "source": "export default {}",
    "language": "typescript",
    "region": "eu",
    "compatibilityDate": "2026-10-11",
    "secretVersionIds": [VERSION],
    "egressOrigins": ["https://example.com"],
}
DEPLOY = {
    "id": DEPLOYMENT,
    "functionId": FUNCTION,
    "source": CREATEDEPLOY["source"],
    "language": "typescript",
    "region": "eu",
    "compatibilityDate": "2026-10-11",
    "secretVersionIds": [VERSION],
    "egressOrigins": ["https://example.com"],
    "sha256": "a" * 64,
    "createdAt": NOW,
}
SECRET = {"id": VERSION, "name": "API_KEY", "createdAt": NOW, "revokedAt": None}
INV = {
    "id": INVOCATION,
    "functionId": FUNCTION,
    "deploymentId": DEPLOYMENT,
    "outcome": "succeeded",
    "trigger": "test",
    "errorCode": None,
    "durationMs": 1.5,
    "responseBytes": 2,
    "attempt": 1,
    "createdAt": NOW,
    "completedAt": NOW,
}
REQUEST = {
    "method": "POST",
    "url": "https://function.polymorfa.invalid/flow",
    "headers": {"content-type": "application/json"},
    "bodyBase64": "e30=",
}
RESULT = {
    "receipt": INV,
    "replayed": False,
    "response": {
        "status": 200,
        "headers": {"content-type": "application/json"},
        "bodyBase64": "e30=",
    },
    "responseRetained": False,
    "retryable": False,
}
BASE = "/platform/functions"
FID = "/" + FUNCTION
FILTER = {"limit": 10, "before": "cursor_1"}
FUNCTIONS = [
    (
        "functions.list",
        "GET",
        BASE,
        None,
        FILTER,
        {"items": [F], "nextCursor": "cursor_2"},
        lambda r, o: r.functions.list(FILTER, options=o),
    ),
    (
        "functions.create",
        "POST",
        BASE,
        {"name": "Support", "functionId": FUNCTION},
        {},
        F,
        lambda r, o: r.functions.create({"name": "Support", "functionId": FUNCTION}, options=o),
    ),
    (
        "functions.retrieve",
        "GET",
        BASE + FID,
        None,
        {},
        F,
        lambda r, o: r.functions.retrieve(FUNCTION, options=o),
    ),
    (
        "functions.update",
        "PATCH",
        BASE + FID,
        {"expectedRevision": 1, "enabled": False},
        {},
        F,
        lambda r, o: r.functions.update(
            FUNCTION, {"expectedRevision": 1, "enabled": False}, options=o
        ),
    ),
    (
        "functions.delete",
        "DELETE",
        BASE + FID,
        None,
        {"expectedRevision": 1},
        {"ok": True},
        lambda r, o: r.functions.delete(FUNCTION, 1, options=o),
    ),
    (
        "functions.deployments.list",
        "GET",
        BASE + FID + "/deployments",
        None,
        FILTER,
        {"items": [{k: v for k, v in DEPLOY.items() if k != "source"}], "nextCursor": None},
        lambda r, o: r.functions.deployments.list(FUNCTION, FILTER, options=o),
    ),
    (
        "functions.deployments.create",
        "POST",
        BASE + FID + "/deployments",
        CREATEDEPLOY,
        {},
        DEPLOY,
        lambda r, o: r.functions.deployments.create(FUNCTION, CREATEDEPLOY, options=o),
    ),
    (
        "functions.deployments.retrieve",
        "GET",
        BASE + FID + "/deployments/" + DEPLOYMENT,
        None,
        {},
        DEPLOY,
        lambda r, o: r.functions.deployments.retrieve(FUNCTION, DEPLOYMENT, options=o),
    ),
    (
        "functions.deployments.promote",
        "PUT",
        BASE + FID + "/promotion",
        {"deploymentId": DEPLOYMENT, "expectedRevision": 1},
        {},
        F,
        lambda r, o: r.functions.deployments.promote(
            FUNCTION, {"deploymentId": DEPLOYMENT, "expectedRevision": 1}, options=o
        ),
    ),
    (
        "functions.secrets.list",
        "GET",
        BASE + FID + "/secrets",
        None,
        FILTER,
        {"items": [SECRET], "nextCursor": None},
        lambda r, o: r.functions.secrets.list(FUNCTION, FILTER, options=o),
    ),
    (
        "functions.secrets.create",
        "POST",
        BASE + FID + "/secrets",
        {"name": "API_KEY", "value": "fixture_only_value"},
        {},
        SECRET,
        lambda r, o: r.functions.secrets.create(
            FUNCTION, {"name": "API_KEY", "value": "fixture_only_value"}, options=o
        ),
    ),
    (
        "functions.secrets.revoke",
        "DELETE",
        BASE + FID + "/secrets/" + VERSION,
        None,
        {},
        {"ok": True},
        lambda r, o: r.functions.secrets.revoke(FUNCTION, VERSION, options=o),
    ),
    (
        "functions.invocations.list",
        "GET",
        BASE + FID + "/invocations",
        None,
        FILTER,
        {"items": [INV], "nextCursor": None},
        lambda r, o: r.functions.invocations.list(FUNCTION, FILTER, options=o),
    ),
    (
        "functions.invocations.retrieve",
        "GET",
        BASE + FID + "/invocations/" + INVOCATION,
        None,
        {},
        INV,
        lambda r, o: r.functions.invocations.retrieve(FUNCTION, INVOCATION, options=o),
    ),
    (
        "functions.invocations.create",
        "POST",
        BASE + FID + "/invocations",
        {"deploymentId": DEPLOYMENT, "request": REQUEST, "trigger": "test"},
        {},
        RESULT,
        lambda r, o: r.functions.invocations.create(
            FUNCTION, {"deploymentId": DEPLOYMENT, "request": REQUEST, "trigger": "test"}, options=o
        ),
    ),
]
LINK = {
    "session": "support",
    "sessionId": "number_1",
    "wabaId": "waba_1",
    "metaFlowId": "meta_1",
    "status": "DRAFT",
    "categories": ["OTHER"],
    "validationErrors": [
        {
            "error": "invalid",
            "errorType": "schema",
            "message": "bad screen",
            "lineStart": 1,
            "lineEnd": 2,
            "columnStart": 1,
            "columnEnd": 5,
            "pointers": [{"path": "screens[0]", "lineStart": 1}],
        }
    ],
    "uploadState": "invalid",
    "previewUrl": "https://example.com",
    "previewExpiresAt": 4,
    "lastSyncedAt": 2,
    "definitionDigest": "a" * 64,
    "simulated": True,
}
DRAFT = {
    "id": FLOW,
    "name": "Survey",
    "status": "draft",
    "version": "7.1",
    "screenCount": 1,
    "metaLinks": [LINK],
    "createdAt": 1,
    "updatedAt": 2,
    "definition": {"version": "7.1", "screens": []},
    "future": True,
}
PROVIDER = {
    "id": "receipt_1",
    "requestId": "request_1",
    "flowId": FLOW,
    "flowName": "Survey",
    "sessionId": "number_1",
    "session": "support",
    "action": "upload",
    "state": "uncertain",
    "resolution": None,
    "wabaId": "waba_1",
    "metaFlowId": "meta_1",
    "definitionDigest": "a" * 64,
    "providerStatus": None,
    "errorCode": "lost_response",
    "providerCode": None,
    "providerSubcode": None,
    "createdAt": 1,
    "updatedAt": 2,
    "completedAt": None,
}
KEY = {
    "id": "key_1",
    "state": "active",
    "fingerprint": "a" * 64,
    "publicKey": "fixture_only_public_key",
    "errorCode": None,
    "createdAt": 1,
    "activatedAt": 2,
    "retireAfter": None,
}
CUSTODY = {"custody": "managed", "activeKeyId": "key_1", "keys": [KEY]}
ENDPOINT = {
    "id": "endpoint_1",
    "orgId": "org_1",
    "projectId": PROJECT,
    "flowId": FLOW,
    "sessionId": "number_1",
    "mode": "forward",
    "url": "https://example.com/flow",
    "functionId": None,
    "deploymentId": None,
    "enabled": True,
    "revision": 2,
    "endpointUri": "https://example.invalid/data",
    "createdAt": 1,
    "updatedAt": 2,
}
RECEIPT = {
    "id": "receipt_1",
    "flowId": FLOW,
    "endpointId": "endpoint_1",
    "sessionId": "number_1",
    "mode": "forward",
    "action": "data_exchange",
    "outcome": "succeeded",
    "httpStatus": 200,
    "errorCode": None,
    "keyId": "key_1",
    "functionInvocationId": None,
    "durationMs": 1.5,
    "createdAt": 1,
    "completedAt": 2,
}
FB = "/platform/flows"
FLOWID = "/" + FLOW
NUM = {"sessionId": "number_1"}
PINPUT = {**NUM, "categories": ["OTHER"], "requestId": "request_1"}
FLOWS = [
    (
        "flows.list",
        "GET",
        FB,
        None,
        {},
        [{k: v for k, v in DRAFT.items() if k != "definition"}],
        lambda r, o: r.flows.list(options=o),
    ),
    (
        "flows.create",
        "POST",
        FB,
        {"draftId": FLOW, "name": "Survey", "definition": DRAFT["definition"]},
        {},
        DRAFT,
        lambda r, o: r.flows.create(
            {"draftId": FLOW, "name": "Survey", "definition": DRAFT["definition"]}, options=o
        ),
    ),
    (
        "flows.retrieve",
        "GET",
        FB + FLOWID,
        None,
        {},
        DRAFT,
        lambda r, o: r.flows.retrieve(FLOW, options=o),
    ),
    (
        "flows.update",
        "PATCH",
        FB + FLOWID,
        {"expectedUpdatedAt": 2, "name": "New"},
        {},
        DRAFT,
        lambda r, o: r.flows.update(FLOW, {"expectedUpdatedAt": 2, "name": "New"}, options=o),
    ),
    (
        "flows.delete",
        "DELETE",
        FB + FLOWID,
        None,
        {},
        {"ok": True},
        lambda r, o: r.flows.delete(FLOW, options=o),
    ),
    (
        "flows.upload",
        "POST",
        FB + FLOWID + "/upload",
        PINPUT,
        {},
        {"operation": PROVIDER, "flow": DRAFT},
        lambda r, o: r.flows.upload(FLOW, PINPUT, options=o),
    ),
    (
        "flows.publish",
        "POST",
        FB + FLOWID + "/publish",
        PINPUT,
        {},
        {"operation": PROVIDER, "flow": DRAFT},
        lambda r, o: r.flows.publish(FLOW, PINPUT, options=o),
    ),
    (
        "flows.deprecate",
        "POST",
        FB + FLOWID + "/deprecate",
        PINPUT,
        {},
        {"operation": PROVIDER, "flow": DRAFT},
        lambda r, o: r.flows.deprecate(FLOW, PINPUT, options=o),
    ),
    (
        "flows.discard",
        "POST",
        FB + FLOWID + "/discard",
        PINPUT,
        {},
        {"operation": PROVIDER, "flow": DRAFT},
        lambda r, o: r.flows.discard(FLOW, PINPUT, options=o),
    ),
    (
        "flows.sync",
        "POST",
        FB + FLOWID + "/sync",
        PINPUT,
        {},
        {"operation": None, "flow": DRAFT},
        lambda r, o: r.flows.sync(FLOW, PINPUT, options=o),
    ),
    (
        "flows.receipts",
        "GET",
        FB + FLOWID + "/receipts",
        None,
        {},
        [PROVIDER],
        lambda r, o: r.flows.receipts(FLOW, options=o),
    ),
    (
        "flows.endpoint",
        "GET",
        FB + FLOWID + "/endpoint",
        None,
        NUM,
        {"endpoint": ENDPOINT, "encryption": CUSTODY},
        lambda r, o: r.flows.endpoint(FLOW, NUM, options=o),
    ),
    (
        "flows.set_endpoint",
        "PUT",
        FB + FLOWID + "/endpoint",
        {
            **NUM,
            "mode": "forward",
            "url": "https://example.com/flow",
            "expectedRevision": 1,
            "enabled": True,
            "rotateSigningSecret": True,
        },
        {},
        {"endpoint": ENDPOINT, "encryption": CUSTODY, "signingSecret": "fixture_only_secret"},
        lambda r, o: r.flows.set_endpoint(
            FLOW,
            {
                **NUM,
                "mode": "forward",
                "url": "https://example.com/flow",
                "expectedRevision": 1,
                "enabled": True,
                "rotateSigningSecret": True,
            },
            options=o,
        ),
    ),
    (
        "flows.delete_endpoint",
        "DELETE",
        FB + FLOWID + "/endpoint",
        None,
        NUM,
        {"ok": True},
        lambda r, o: r.flows.delete_endpoint(FLOW, NUM, options=o),
    ),
    (
        "flows.endpoint_receipts",
        "GET",
        FB + FLOWID + "/endpoint/receipts",
        None,
        {**NUM, "limit": 10},
        [RECEIPT],
        lambda r, o: r.flows.endpoint_receipts(FLOW, {**NUM, "limit": 10}, options=o),
    ),
    (
        "flows.encryption_key",
        "GET",
        "/platform/flow-encryption-keys",
        None,
        NUM,
        CUSTODY,
        lambda r, o: r.flows.encryption_key(NUM, options=o),
    ),
    (
        "flows.rotate_encryption_key",
        "POST",
        "/platform/flow-encryption-keys/rotate",
        NUM,
        {},
        {**CUSTODY, "key": KEY},
        lambda r, o: r.flows.rotate_encryption_key(NUM, options=o),
    ),
]


@pytest.mark.parametrize("project_token", [False, True])
@pytest.mark.parametrize("case", FUNCTIONS + FLOWS)
async def test_public_function_flow_methods_bound_identity_and_typed_response(project_token, case):
    _, method, path, body, query, value, invoke = case

    def handler(request):
        assert request.method == method and request.url.path == path
        expected_query = {**query, "projectId": PROJECT} if method in {"GET", "DELETE"} else query
        expected_body = (
            {**(body or {}), "projectId": PROJECT} if method not in {"GET", "DELETE"} else None
        )
        assert dict(request.url.params) == {k: str(v) for k, v in expected_query.items()}
        assert (json.loads(request.content) if request.content else None) == expected_body
        assert request.headers["idempotency-key"] == "explicit_key"
        assert request.headers["x-proof"] == "functions-flows"
        return httpx.Response(200, json={"data": value}, headers={"x-request-id": "req_workflow"})

    credential = (
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A")
        if project_token
        else Credential("organization_api_key", "pmfa_" + "a" * 72)
    )
    cls = AsyncProjectClient if project_token else AsyncClient
    args = (credential, PROJECT) if project_token else (credential,)
    async with cls(*args, http_transport=httpx.MockTransport(handler)) as client:
        project = client if project_token else client.project(PROJECT)
        response = await invoke(
            project,
            RequestOptions(
                headers={"x-proof": "functions-flows"},
                idempotency_key="explicit_key",
                max_network_retries=2,
            ),
        )
        assert response.data == value and response.metadata.request_id == "req_workflow"


@pytest.mark.parametrize("case", [case for case in FUNCTIONS + FLOWS if case[1] != "GET"])
async def test_all_function_flow_writes_and_deletes_never_retry(case):
    calls = []

    def handler(request):
        calls.append(request)
        return httpx.Response(
            503,
            json={"error": {"code": "busy", "message": "retry"}},
            headers={"retry-after": "0", "x-request-id": "req_once"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ServerError) as caught:
            await case[-1](
                client.project(PROJECT),
                RequestOptions(idempotency_key="explicit_key", max_network_retries=2),
            )
        assert caught.value.metadata.request_id == "req_once"
    assert len(calls) == 1


async def test_function_validation_and_flow_endpoint_boundaries():
    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(200, json={"data": F})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        p = client.project(PROJECT)
        for bad in [
            "not_uuid",
            "AAAAAAAA-AAAA-4AAA-8AAA-AAAAAAAAAAAA",
            FUNCTION + "/path",
            "../escape",
        ]:
            with pytest.raises(ValidationError):
                await p.functions.retrieve(bad)
        for revision in [0, -1, True, 1.5, 9007199254740992]:
            with pytest.raises(ValidationError):
                await p.functions.update(FUNCTION, {"expectedRevision": revision})
        for key in [None, "", "has space", "a" * 129, "new\nline"]:
            with pytest.raises((ValidationError, ConfigurationError)):
                await p.functions.invocations.create(
                    FUNCTION, {"request": REQUEST}, options=RequestOptions(idempotency_key=key)
                )
        for input in [{"name": "x", "projectId": PROJECT}, {"name": "x", "functionId": "invalid"}]:
            with pytest.raises(ValidationError):
                await p.functions.create(input)
        with pytest.raises(ValidationError):
            await p.functions.update(FUNCTION, {"expectedRevision": 1, "functionId": FUNCTION})
        with pytest.raises(ConfigurationError):
            await p.flows.create({"name": "x", "definition": {}, "projectId": PROJECT})
        with pytest.raises(ConfigurationError):
            await p.flows.update(FLOW, {"expectedUpdatedAt": 2, "flowId": FLOW})
        for stamp in [None, True, float("nan"), float("inf")]:
            with pytest.raises(ValidationError):
                await p.flows.update(FLOW, {"expectedUpdatedAt": stamp})
        for url in [
            "http://example.com",
            "https://user:pass@example.com",
            "https://example.com#secret",
            "not url",
        ]:
            with pytest.raises(ValidationError):
                await p.flows.set_endpoint(FLOW, {**NUM, "mode": "forward", "url": url})
        for bad in [
            {**NUM, "mode": "function", "functionId": ""},
            {**NUM, "mode": "unknown"},
            {**NUM, "mode": "direct", "url": "https://example.com", "expectedRevision": True},
            {"sessionId": " ", "mode": "direct", "url": "https://example.com"},
        ]:
            with pytest.raises(ValidationError):
                await p.flows.set_endpoint(FLOW, bad)
        for limit in [0, 101, True, 1.5]:
            with pytest.raises(ValidationError):
                await p.flows.endpoint_receipts(FLOW, {"limit": limit})
    assert not seen


@pytest.mark.parametrize(
    "body",
    [
        {**NUM, "mode": "direct", "url": "https://example.com/flow"},
        {**NUM, "mode": "function", "functionId": FUNCTION, "deploymentId": None},
    ],
)
async def test_endpoint_variants_and_once_only_response(body):
    def handler(request):
        assert json.loads(request.content) == {**body, "projectId": PROJECT}
        endpoint = {
            **ENDPOINT,
            "mode": body["mode"],
            "url": body.get("url"),
            "functionId": body.get("functionId"),
            "deploymentId": None,
        }
        return httpx.Response(
            200,
            json={
                "data": {
                    "endpoint": endpoint,
                    "encryption": {"custody": "customer", "activeKeyId": None, "keys": []},
                }
            },
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await client.project(PROJECT).flows.set_endpoint(FLOW, body)
        assert (
            "signingSecret" not in result.data and result.data["endpoint"]["mode"] == body["mode"]
        )
