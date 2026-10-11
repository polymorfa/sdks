import httpx
import pytest

from polymorfa import AsyncClient, Credential

ORG = {
    "id": "org_1",
    "externalId": "external_1",
    "name": "Example",
    "slug": None,
    "email": "owner@example.com",
    "timezone": None,
    "creditBalanceCents": 1.125,
    "lowBalanceThresholdCents": 0.5,
    "billingEmail": None,
    "status": None,
    "plan": None,
    "planStatus": None,
    "isActive": True,
    "createdAt": 1,
    "updatedAt": 2,
}
MEMBER = {
    "_id": "member_1",
    "_creationTime": 1,
    "orgId": "org_1",
    "userId": "user_1",
    "email": "owner@example.com",
    "name": None,
    "role": "owner",
    "status": "active",
    "invitedAt": None,
    "joinedAt": 1,
}
KEY = {
    "_id": "key_1",
    "_creationTime": 1,
    "id": "key_1",
    "keyId": "key_1",
    "start": "pmfa",
    "last4": "abcd",
    "orgId": "org_1",
    "label": "Server",
    "scopes": 1,
    "source": "api",
    "expiresAt": 2000,
    "lastUsed": 1000,
    "isActive": True,
}
TOKEN = {
    "id": "token_1",
    "start": "pmfa_pt",
    "last4": "abcd",
    "label": None,
    "scopes": 1,
    "expiresAt": None,
    "createdAt": 1,
    "lastUsedAt": None,
    "revokedAt": None,
}
AUDIT = {
    "id": "audit_1",
    "actorEmail": "owner@example.com",
    "actorUserId": None,
    "actorRole": None,
    "action": "update",
    "resource": "project",
    "projectId": None,
    "projectName": None,
    "ip": None,
    "userAgent": None,
    "duration": None,
    "source": None,
    "description": None,
    "result": "ok",
    "metadata": {"future": [None, 1, True]},
    "createdAt": 1,
}
BAN = {
    "id": "ban_1",
    "sessionName": "support",
    "banCode": None,
    "banReason": None,
    "banExpiresAt": None,
    "occurredAt": 1,
    "status": "active",
}
INCIDENT = {
    "id": "incident_1",
    "keyId": "key_1",
    "tokenType": "organization",
    "source": "api",
    "url": None,
    "ref": None,
    "resolution": "revoked",
    "detectedAt": 1,
    "acknowledgedAt": None,
    "acknowledgedBy": None,
    "createdAt": 1,
}
CASES = [
    ("GET", "/platform/team", {}, ORG, lambda c: c.organizations.retrieve()),
    ("GET", "/platform/members", {}, [MEMBER], lambda c: c.members.list()),
    ("GET", "/platform/keys", {}, [KEY], lambda c: c.api_keys.list()),
    (
        "DELETE",
        "/platform/keys/key_1",
        {},
        {"ok": True, "keyId": "key_1"},
        lambda c: c.api_keys.deactivate("key_1"),
    ),
    (
        "GET",
        "/platform/tokens",
        {"projectId": "project_1"},
        [TOKEN],
        lambda c: c.project_tokens.list("project_1"),
    ),
    (
        "GET",
        "/platform/audit",
        {"action": "update", "resource": "project", "limit": "10"},
        [AUDIT],
        lambda c: c.audit_logs.list(action="update", resource="project", limit=10),
    ),
    ("GET", "/platform/bans", {}, [BAN], lambda c: c.session_bans.list()),
    ("GET", "/platform/bans/active", {}, [BAN], lambda c: c.session_bans.list_active()),
    ("GET", "/platform/incidents", {}, [INCIDENT], lambda c: c.security_incidents.list()),
    (
        "POST",
        "/platform/incidents/incident_1/acknowledge",
        {},
        {"acknowledged": True},
        lambda c: c.security_incidents.acknowledge("incident_1"),
    ),
]


@pytest.mark.parametrize("method,path,query,data,invoke", CASES)
async def test_organization_metadata_methods(method, path, query, data, invoke):
    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == query and not request.content
        assert request.headers["authorization"] == "Bearer pmfa_" + "a" * 72
        return httpx.Response(200, json={"data": data}, headers={"x-request-id": "req_org"})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        result = await invoke(client)
        assert result.data == {"data": data} and result.metadata.request_id == "req_org"
        assert result.metadata.status == 200
        if path in ("/platform/keys", "/platform/tokens"):
            assert "value" not in result.data["data"][0]
