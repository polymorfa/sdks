"""Observation policies, Hybrid Link controls and saved connection defaults."""

from typing import Literal
from urllib.parse import unquote

from typing_extensions import NotRequired, TypedDict

from . import campaign_contract_validation as V
from . import connection_delivery_validation as D
from .configuration import ConfigurationView
from .messaging import O, Resource, segment
from .models import ConnectionUpdate, Envelope
from .platform import PlatformResource
from .transport import ApiResponse, QueryValue, RequestOptions

ObservationMode = Literal["off", "events", "cache"]
LabelMode = Literal["off", "events", "cache", "project"]


class ProjectObservationPolicy(TypedDict):
    projectId: str
    presenceMode: ObservationMode
    typingMode: ObservationMode
    labelMode: LabelMode
    quickReplyMode: NotRequired[ObservationMode]


class ObservationValues(TypedDict):
    presenceMode: ObservationMode
    typingMode: ObservationMode
    labelMode: LabelMode
    quickReplyMode: NotRequired[ObservationMode]


class ObservationOverrides(TypedDict):
    presenceMode: ObservationMode | Literal["inherit"]
    typingMode: ObservationMode | Literal["inherit"]
    labelMode: LabelMode | Literal["inherit"]
    quickReplyMode: NotRequired[ObservationMode | Literal["inherit"]]


class ConnectionObservationPolicy(TypedDict):
    connectionName: str
    projectId: str
    project: ObservationValues
    override: ObservationOverrides
    effective: ObservationValues


class ObservationPolicies(Resource):
    async def retrieve_for_project(
        self, project_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ProjectObservationPolicy]]:
        return await self._request(
            "GET", f"/messaging/projects/{segment(project_id)}/observation-policy", options=options
        )

    async def retrieve_for_connection(
        self, connection: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ConnectionObservationPolicy]]:
        return await self._request(
            "GET", f"/messaging/{segment(connection)}/observation-policy", options=options
        )


class TeamScope(TypedDict):
    scope: Literal["team"]


class ProjectScope(TypedDict):
    scope: Literal["project"]
    projectId: str


class ConnectionScope(TypedDict):
    scope: Literal["connection"]
    projectId: str
    connection: str


RoutingScope = TeamScope | ProjectScope | ConnectionScope
Connection = Literal["linked_devices", "official_api"]


class RoutingPolicy(TypedDict):
    scope: Literal["team", "project", "connection"]
    revision: str
    prefer: Connection | None
    allowedTransports: list[Connection]


class SetRoutingPolicy(TypedDict):
    expectedRevision: str
    prefer: Connection | None
    allowedTransports: list[Connection]


class LinkConnection(TypedDict):
    kind: Connection
    status: str
    enabled: bool


class LinkPause(TypedDict):
    revision: str
    paused: bool


class LinkState(LinkPause):
    connections: list[LinkConnection]


class SetLinkPause(TypedDict):
    expectedRevision: str
    paused: bool


def _query(scope: RoutingScope) -> dict[str, QueryValue]:
    query: dict[str, QueryValue] = {"scope": scope["scope"]}
    if scope["scope"] != "team":
        query["projectId"] = scope["projectId"]
    if scope["scope"] == "connection":
        query["connection"] = scope["connection"]
    return query


class HybridLink(Resource):
    async def get_policy(
        self, scope: RoutingScope, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[RoutingPolicy]]:
        self._server()
        return await self._request(
            "GET", "/messaging/routing/hybrid", query=_query(scope), options=options
        )

    async def set_policy(
        self, scope: RoutingScope, body: SetRoutingPolicy, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[RoutingPolicy]]:
        self._server()
        return await self._request(
            "PUT", "/messaging/routing/hybrid", query=_query(scope), body=body, options=options
        )

    async def state(
        self, connection: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[LinkState]]:
        self._server()
        return await self._request(
            "GET", f"/messaging/{segment(connection)}/hybrid-link", options=options
        )

    async def set_paused(
        self, connection: str, body: SetLinkPause, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[LinkPause]]:
        self._server()
        return await self._request(
            "PUT", f"/messaging/{segment(connection)}/hybrid-link", body=body, options=options
        )


class ConnectionConfigurations(PlatformResource):
    @property
    def _project_id(self) -> str | None:
        return (
            unquote(self._prefix.rsplit("/", 1)[1])
            if self._prefix.startswith("/platform/projects/")
            else None
        )

    async def retrieve(self, *, options: RequestOptions = O) -> ApiResponse[ConfigurationView]:
        return await self._unwrapped(
            "GET",
            "/platform/connection-configuration",
            query={"projectId": self._project_id},
            options=options,
        )

    async def update(
        self, body: ConnectionUpdate, *, options: RequestOptions = O
    ) -> ApiResponse[ConfigurationView]:
        options = D.options(options, D.configuration_intent(body))
        wire: dict[str, object] = {
            "configuration": body["configuration"],
            "revision": body["revision"],
        }
        if self._project_id is not None:
            wire["projectId"] = self._project_id
        return await self._unwrapped(
            "PUT", "/platform/connection-configuration", body=V.capture(wire), options=options
        )


def graph_transport_headers(
    transport: Literal["auto", "linked_devices", "official_api"],
) -> dict[str, str]:
    return {"X-Polymorfa-Transport": transport}
