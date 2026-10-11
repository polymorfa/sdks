"""Credential-free system probes and project-token Bridge route discovery."""

from dataclasses import dataclass
from typing import Literal, cast

from typing_extensions import NotRequired, Self, TypedDict, Unpack

from .errors import ConfigurationError
from .messaging import O, Resource
from .transport import ApiResponse, ClientOptions, Credential, RequestOptions, Transport


class Status(TypedDict):
    status: str
    uptime: str
    version: str
    env: str


class Version(TypedDict):
    version: str
    buildTime: str
    env: str
    apiVersion: str
    minSupportedVersion: str


class HealthCheck(TypedDict):
    status: str
    error: NotRequired[str]


class Health(TypedDict):
    status: str
    checks: dict[str, HealthCheck]


class Ping(TypedDict):
    status: str


class BridgeRoute(TypedDict):
    wsUrl: str
    region: Literal["BR", "US", "IN", "Auto"]
    kind: Literal["sandbox", "production"]
    signal: Literal["customer", "bartender"]
    tokenKind: Literal["project"]
    expiresAt: int


@dataclass(frozen=True, init=False)
class AsyncSystemClient:
    _transport: Transport

    def __init__(self, **options: Unpack[ClientOptions]) -> None:
        object.__setattr__(self, "_transport", Transport(None, **options))

    async def status(self, *, options: RequestOptions = O) -> ApiResponse[Status]:
        return cast(
            ApiResponse[Status],
            await self._transport.request("GET", "/messaging/info/status", options=options),
        )

    async def version(self, *, options: RequestOptions = O) -> ApiResponse[Version]:
        return cast(
            ApiResponse[Version],
            await self._transport.request("GET", "/messaging/info/version", options=options),
        )

    async def health(self, *, options: RequestOptions = O) -> ApiResponse[Health]:
        return cast(
            ApiResponse[Health], await self._transport.request("GET", "/health", options=options)
        )

    async def ping(self, *, options: RequestOptions = O) -> ApiResponse[Ping]:
        return cast(
            ApiResponse[Ping], await self._transport.request("GET", "/ping", options=options)
        )

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()


class BridgeRoutes(Resource):
    async def resolve(self, *, options: RequestOptions = O) -> ApiResponse[BridgeRoute]:
        return await self._request("GET", "/messaging/bridge/route", options=options)


@dataclass(frozen=True, init=False)
class AsyncBridgeClient:
    _transport: Transport
    routes: BridgeRoutes

    def __init__(self, credential: Credential, **options: Unpack[ClientOptions]) -> None:
        if credential.kind != "project_token":
            raise ConfigurationError("credential")
        transport = Transport(credential, **options)
        object.__setattr__(self, "_transport", transport)
        object.__setattr__(self, "routes", BridgeRoutes(transport, credential.kind))

    async def close(self) -> None:
        await self._transport.close()

    async def __aenter__(self) -> Self:
        return self

    async def __aexit__(self, *args: object) -> None:
        await self.close()
