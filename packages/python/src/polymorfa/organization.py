"""Organization metadata, credential metadata and security observations."""

from __future__ import annotations

import builtins
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .messaging import O, Resource, segment
from .models import DataEnvelope
from .transport import ApiResponse, RequestOptions


class Organization(TypedDict):
    id: str
    externalId: str
    name: str
    slug: str | None
    email: str
    timezone: str | None
    creditBalanceCents: float
    lowBalanceThresholdCents: float
    billingEmail: str | None
    status: str | None
    plan: str | None
    planStatus: str | None
    isActive: bool
    createdAt: int
    updatedAt: int


class Member(TypedDict):
    _id: str
    _creationTime: int
    orgId: str
    userId: str
    email: str
    name: str | None
    role: Literal["owner", "admin", "member"]
    status: str
    invitedAt: int | None
    joinedAt: int | None


class ApiKey(TypedDict):
    _id: str
    _creationTime: int
    id: str
    keyId: str
    start: str
    last4: str
    orgId: str
    label: str
    scopes: int
    source: str
    expiresAt: int
    lastUsed: NotRequired[int]
    isActive: bool


class KeyDeactivated(TypedDict):
    ok: Literal[True]
    keyId: str


class ProjectToken(TypedDict):
    id: str
    start: str
    last4: str
    label: str | None
    scopes: int
    expiresAt: int | None
    createdAt: int
    lastUsedAt: int | None
    revokedAt: int | None


class AuditLog(TypedDict):
    id: str
    actorEmail: str
    actorUserId: str | None
    actorRole: str | None
    action: str
    resource: str
    projectId: str | None
    projectName: str | None
    ip: str | None
    userAgent: str | None
    duration: int | None
    source: str | None
    description: str | None
    result: str
    metadata: object
    createdAt: int


class SessionBan(TypedDict):
    id: str
    sessionName: str
    banCode: int | None
    banReason: str | None
    banExpiresAt: int | None
    occurredAt: int
    status: Literal["active", "lifted"]


class Incident(TypedDict):
    id: str
    keyId: str
    tokenType: str
    source: str
    url: str | None
    ref: str | None
    resolution: str
    detectedAt: int
    acknowledgedAt: int | None
    acknowledgedBy: str | None
    createdAt: int


class Acknowledged(TypedDict):
    acknowledged: Literal[True]


class Organizations(Resource):
    async def retrieve(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Organization]]:
        return await self._request("GET", "/platform/team", options=options)


class Members(Resource):
    async def list(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[Member]]]:
        return await self._request("GET", "/platform/members", options=options)


class ApiKeys(Resource):
    async def list(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[ApiKey]]]:
        return await self._request("GET", "/platform/keys", options=options)

    async def deactivate(
        self, key_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[KeyDeactivated]]:
        return await self._request("DELETE", f"/platform/keys/{segment(key_id)}", options=options)


class ProjectTokens(Resource):
    async def list(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[ProjectToken]]]:
        return await self._request(
            "GET", "/platform/tokens", query={"projectId": project_id}, options=options
        )


class AuditLogs(Resource):
    async def list(
        self,
        *,
        action: str | None = None,
        resource: str | None = None,
        limit: int | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[DataEnvelope[builtins.list[AuditLog]]]:
        return await self._request(
            "GET",
            "/platform/audit",
            query={"action": action, "resource": resource, "limit": limit},
            options=options,
        )


class SessionBans(Resource):
    async def list(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[SessionBan]]]:
        return await self._request("GET", "/platform/bans", options=options)

    async def list_active(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[SessionBan]]]:
        return await self._request("GET", "/platform/bans/active", options=options)


class SecurityIncidents(Resource):
    async def list(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[Incident]]]:
        return await self._request("GET", "/platform/incidents", options=options)

    async def acknowledge(
        self, incident_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[Acknowledged]]:
        return await self._request(
            "POST", f"/platform/incidents/{segment(incident_id)}/acknowledge", options=options
        )
