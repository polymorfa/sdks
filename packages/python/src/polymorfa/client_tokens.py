"""Server-owned token minting and session client rules."""

from __future__ import annotations

from typing import Literal, cast

from typing_extensions import NotRequired, TypedDict

from .errors import ConfigurationError
from .messaging import O, Resource, segment
from .models import Envelope, Success
from .transport import ApiResponse, JsonObject, RequestOptions

CustomerAction = Literal[
    "send_message",
    "send_reaction",
    "send_typing",
    "send_seen",
    "read_presence",
    "subscribe_presence",
    "read_contact",
]
RecipientMode = Literal["conversation", "any", "none"]


class MintSessionTokenRequest(TypedDict):
    ephemeralId: str
    session: str
    ttlSeconds: NotRequired[int]


class MintCustomerTokenRequest(TypedDict):
    ephemeralId: str
    customer: str
    allow: NotRequired[list[CustomerAction]]
    ttlSeconds: NotRequired[int]


class ClientTokenValue(TypedDict):
    token: str
    expiresAt: str


class ClientRules(TypedDict):
    recipientMode: Literal["conversation", "any", "none", "verified"]
    allowedActions: str
    rateLimit: int
    maxDaily: int
    allowedOrigins: str
    conversationTtlSeconds: int
    maxConcurrency: int
    maxSetupsPerMinute: int
    allowedNumber: str
    enabled: bool


class SetClientRulesRequest(TypedDict):
    recipientMode: RecipientMode
    enabled: bool
    allowedActions: NotRequired[str]
    rateLimit: NotRequired[int]
    maxDaily: NotRequired[int]
    allowedOrigins: NotRequired[str]
    conversationTtlSeconds: NotRequired[int]
    maxConcurrency: NotRequired[int]
    maxSetupsPerMinute: NotRequired[int]
    allowedNumber: NotRequired[str]


class ClientTokens(Resource):
    async def mint(
        self,
        body: MintSessionTokenRequest | MintCustomerTokenRequest,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[ClientTokenValue]]:
        self._server()
        payload = cast(JsonObject, body)
        session = isinstance(payload.get("session"), str) and bool(payload.get("session"))
        customer = isinstance(payload.get("customer"), str) and bool(payload.get("customer"))
        if session == customer:
            raise ConfigurationError("customer" if session else "session")
        if "allow" in payload and not customer:
            raise ConfigurationError("allow")
        return cast(
            ApiResponse[Envelope[ClientTokenValue]],
            await self._transport.request(
                "POST", "/platform/client-tokens", body=payload, options=options
            ),
        )

    async def retrieve_rules(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ClientRules]]:
        self._server()
        return cast(
            ApiResponse[Envelope[ClientRules]],
            await self._transport.request("GET", self._path(session), options=options),
        )

    async def update_rules(
        self, session: str, body: SetClientRulesRequest, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        self._server()
        return cast(
            ApiResponse[Success],
            await self._transport.request(
                "PUT", self._path(session), body=cast(JsonObject, body), options=options
            ),
        )

    async def delete_rules(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        self._server()
        return cast(
            ApiResponse[Success],
            await self._transport.request("DELETE", self._path(session), options=options),
        )

    @staticmethod
    def _path(session: str) -> str:
        return f"/platform/sessions/{segment(session)}/client-rules"
