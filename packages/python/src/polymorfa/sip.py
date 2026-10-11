"""Typed SIP trunks and environment endpoint with project confinement."""

from __future__ import annotations

import builtins
from dataclasses import replace
from typing import Literal
from urllib.parse import unquote

from typing_extensions import Never, NotRequired, TypedDict

from .errors import ConfigurationError, NotFoundError
from .messaging import O, segment
from .platform import PlatformResource
from .transport import ApiResponse, RequestOptions

Direction = Literal["outbound", "inbound", "both"]
SipTransport = Literal["udp", "tcp", "tls"]
Codec = Literal["PCMU", "PCMA", "opus"]


class Outbound(TypedDict):
    targetUri: str
    transport: SipTransport
    authUsername: str | None
    hasPassword: bool
    fromUser: str | None


class Inbound(TypedDict):
    username: str
    realm: str
    session: str | None
    allowedAddresses: list[str]
    allowedDestinations: list[str]


class Trunk(TypedDict):
    id: str
    projectId: str
    name: str
    enabled: bool
    direction: Direction
    outbound: Outbound | None
    inbound: Inbound | None
    codecs: list[Codec]
    maxConcurrentCalls: int
    revision: int
    createdAt: str
    updatedAt: str


class Credentials(TypedDict):
    username: str
    password: str
    realm: str


class CreatedTrunk(TypedDict):
    trunk: Trunk
    inboundCredentials: NotRequired[Credentials]


class EndpointTransport(TypedDict):
    transport: SipTransport
    port: int
    srtp: Literal["required", "not_supported"]


class Rtp(TypedDict):
    protocol: Literal["udp"]
    portMin: int
    portMax: int


class HostedEndpoint(TypedDict):
    status: Literal["hosted"]
    host: str
    transports: list[EndpointTransport]
    rtp: Rtp


class NotHostedEndpoint(TypedDict):
    status: Literal["sip_not_hosted"]
    host: None
    transports: list[Never]
    rtp: None


class DeletedTrunk(TypedDict):
    id: str
    deleted: Literal[True]


class OutboundInput(TypedDict):
    targetUri: str
    transport: SipTransport
    authUsername: NotRequired[str | None]
    authPassword: NotRequired[str]
    fromUser: NotRequired[str | None]


class InboundInput(TypedDict):
    session: NotRequired[str | None]
    allowedAddresses: list[str]
    allowedDestinations: NotRequired[list[str]]


class CreateBase(TypedDict):
    name: str
    enabled: NotRequired[bool]
    codecs: NotRequired[list[Codec]]
    maxConcurrentCalls: NotRequired[int]


class CreateOutbound(CreateBase):
    direction: Literal["outbound"]
    outbound: OutboundInput


class CreateInbound(CreateBase):
    direction: Literal["inbound"]
    inbound: InboundInput


class CreateBoth(CreateBase):
    direction: Literal["both"]
    outbound: OutboundInput
    inbound: InboundInput


class OutboundPatch(TypedDict, total=False):
    targetUri: str
    transport: SipTransport
    authUsername: str | None
    authPassword: str
    fromUser: str | None


class InboundPatch(TypedDict, total=False):
    session: str | None
    allowedAddresses: list[str]
    allowedDestinations: list[str]


class UpdateTrunk(TypedDict, total=False):
    expectedRevision: int
    name: str
    enabled: bool
    direction: Direction
    outbound: OutboundPatch
    inbound: InboundPatch
    codecs: list[Codec]
    maxConcurrentCalls: int


class SipTrunks(PlatformResource):
    @property
    def _project_id(self) -> str | None:
        return (
            unquote(self._prefix.rsplit("/", 1)[1])
            if self._prefix.startswith("/platform/projects/")
            else None
        )

    def _project(self, project_id: str | None) -> str:
        bound = self._project_id
        if bound is not None:
            if project_id is not None and project_id.lower() != bound.lower():
                raise ConfigurationError("project_id")
            return bound
        if not isinstance(project_id, str) or not project_id.strip():
            raise ConfigurationError("project_id")
        return project_id

    @staticmethod
    def _path(trunk_id: str) -> str:
        if not isinstance(trunk_id, str) or not trunk_id.strip():
            raise ConfigurationError("trunk_id")
        return f"/platform/sip-trunks/{segment(trunk_id)}"

    def _assert_project(self, trunk_id: str, trunk: Trunk) -> None:
        if self._project_id is not None and trunk["projectId"].lower() != self._project_id.lower():
            raise NotFoundError(
                "SIP trunk not found.",
                code="resource_not_found",
                status=404,
                details={"trunkId": trunk_id},
            )

    async def _confine(self, trunk_id: str, options: RequestOptions) -> None:
        if self._project_id is not None and (
            self._transport._credential is None
            or self._transport._credential.kind != "project_token"
        ):
            response: ApiResponse[Trunk] = await self._unwrapped(
                "GET", self._path(trunk_id), options=replace(options, idempotency_key=None)
            )
            self._assert_project(trunk_id, response.data)

    async def list(
        self, *, project_id: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[builtins.list[Trunk]]:
        return await self._unwrapped(
            "GET",
            "/platform/sip-trunks",
            query={"projectId": self._project(project_id)},
            options=options,
        )

    async def endpoint(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[HostedEndpoint | NotHostedEndpoint]:
        return await self._unwrapped("GET", "/platform/sip/endpoint", options=options)

    async def create(
        self,
        body: CreateOutbound | CreateInbound | CreateBoth,
        *,
        project_id: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[CreatedTrunk]:
        wire: dict[str, object] = dict(body)
        wire["projectId"] = self._project(project_id)
        return await self._unwrapped("POST", "/platform/sip-trunks", body=wire, options=options)

    async def retrieve(self, trunk_id: str, *, options: RequestOptions = O) -> ApiResponse[Trunk]:
        response: ApiResponse[Trunk] = await self._unwrapped(
            "GET", self._path(trunk_id), options=options
        )
        self._assert_project(trunk_id, response.data)
        return response

    async def update(
        self, trunk_id: str, body: UpdateTrunk, *, options: RequestOptions = O
    ) -> ApiResponse[Trunk]:
        await self._confine(trunk_id, options)
        return await self._unwrapped("PATCH", self._path(trunk_id), body=body, options=options)

    async def delete(
        self, trunk_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[DeletedTrunk]:
        await self._confine(trunk_id, options)
        return await self._unwrapped("DELETE", self._path(trunk_id), options=options)

    async def rotate_credentials(
        self, trunk_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Credentials]:
        await self._confine(trunk_id, options)
        return await self._unwrapped("POST", self._path(trunk_id) + "/credentials", options=options)
