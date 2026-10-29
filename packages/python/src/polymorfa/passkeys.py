"""Direct server passkey operations. Ceremony and ownership remain API-owned."""

from __future__ import annotations

import json
import re
from dataclasses import replace
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .errors import ValidationError
from .messaging import O, Resource, segment
from .models import Envelope
from .transport import ApiResponse, RequestOptions

UserVerification = Literal["required", "preferred", "discouraged"]
PasskeyStatus = Literal[
    "none",
    "challenge_pending",
    "assertion_sending",
    "assertion_submitted",
    "code_available",
    "confirmation_sending",
    "waiting_for_pairing",
    "completed",
    "failed",
]


class IssuePasskeyChallenge(TypedDict):
    challengeB64Url: NotRequired[str]
    ttlSeconds: NotRequired[int]
    userVerification: NotRequired[UserVerification]  # Deprecated, ignored by server.
    timeoutMs: NotRequired[int]  # Deprecated, ignored by server.


class PasskeyTicket(TypedDict):
    version: Literal[2]
    ticket: str
    session: str
    rpId: str
    challengeB64Url: str
    userVerification: UserVerification
    expiresAt: str
    timeoutMs: NotRequired[int]


class PasskeyAssertionResponse(TypedDict):
    authenticatorDataB64: str
    clientDataJSONB64: str
    signatureB64: str
    userHandleB64: NotRequired[str]


class PasskeyAssertion(TypedDict):
    id: str
    rawIdB64Url: str
    response: PasskeyAssertionResponse


class SubmitPasskeyAssertion(TypedDict):
    ticketId: str
    assertion: PasskeyAssertion


class PasskeyAssertionResult(TypedDict):
    ok: Literal[True]
    ticket: str
    session: str


class ConfirmPasskey(TypedDict):
    ticketId: str
    code: NotRequired[str]


class PasskeyConfirmation(TypedDict):
    status: PasskeyStatus
    ticketId: NotRequired[str]
    code: NotRequired[str]
    skipHandoffUX: NotRequired[bool]
    error: NotRequired[str]


def _text(value: object, limit: int | None = None) -> bool:
    return (
        isinstance(value, str)
        and bool(value)
        and (limit is None or len(value.encode("utf-16-le")) // 2 <= limit)
    )


def _capture(body: object) -> object:
    encoded = json.dumps(body, allow_nan=False)
    if len(encoded.encode()) > 1048576:
        raise ValidationError("Passkey request exceeds 1 MiB.")
    return json.loads(encoded)


class Passkeys(Resource):
    def _path(self, session: str) -> str:
        self._server()
        return f"/messaging/{segment(session)}/passkey"

    async def issue_challenge(
        self,
        session: str,
        body: IssuePasskeyChallenge | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[PasskeyTicket]]:
        path = self._path(session)
        body = {} if body is None else body
        if "challengeB64Url" in body and not _text(body["challengeB64Url"]):
            raise ValidationError("Provide the expected challenge.")
        if "ttlSeconds" in body and type(body["ttlSeconds"]) is not int:
            raise ValidationError("ttlSeconds must be an integer.")
        if "timeoutMs" in body and (type(body["timeoutMs"]) is not int or body["timeoutMs"] <= 0):
            raise ValidationError("timeoutMs must be a positive integer.")
        if "userVerification" in body and body["userVerification"] not in (
            "required",
            "preferred",
            "discouraged",
        ):
            raise ValidationError("Invalid userVerification.")
        return await self._request(
            "POST",
            path + "/challenge",
            body=_capture(body),
            options=replace(options, max_network_retries=0),
        )

    async def get_challenge(
        self, session: str, ticket_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PasskeyTicket]]:
        return await self._request(
            "GET", self._path(session) + "/challenge/" + segment(ticket_id), options=options
        )

    async def submit_assertion(
        self, session: str, body: SubmitPasskeyAssertion, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PasskeyAssertionResult]]:
        path = self._path(session)
        a = body.get("assertion")
        if (
            not _text(body.get("ticketId"))
            or not isinstance(a, dict)
            or not _text(a.get("id"), 1364)
            or not _text(a.get("rawIdB64Url"), 1364)
        ):
            raise ValidationError("Provide the ticket and bounded credential.")
        r = a.get("response")
        if not isinstance(r, dict) or any(
            not _text(r.get(k))
            for k in ("authenticatorDataB64", "clientDataJSONB64", "signatureB64")
        ):
            raise ValidationError("Provide the assertion response.")
        if "userHandleB64" in r and (
            not isinstance(r["userHandleB64"], str)
            or len(r["userHandleB64"].encode("utf-16-le")) // 2 > 86
        ):
            raise ValidationError("userHandleB64 exceeds 86 characters.")
        return await self._request(
            "POST",
            path + "/assertion",
            body=_capture(body),
            options=replace(options, max_network_retries=0),
        )

    async def get_confirmation(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PasskeyConfirmation]]:
        return await self._request("GET", self._path(session) + "/confirmation", options=options)

    async def confirm(
        self, session: str, body: ConfirmPasskey, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PasskeyConfirmation]]:
        path = self._path(session)
        if not _text(body.get("ticketId")) or (
            "code" in body
            and (
                not isinstance(body["code"], str)
                or re.fullmatch(r"[A-Z0-9]{4}-[A-Z0-9]{4}", body["code"]) is None
            )
        ):
            raise ValidationError("Provide the ticket and optional confirmation code.")
        return await self._request(
            "POST",
            path + "/confirmation",
            body=_capture(body),
            options=replace(options, max_network_retries=0),
        )
