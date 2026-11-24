"""Typed synchronized business quick replies and user verification codes."""

from __future__ import annotations

from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .messaging import O, Resource, segment
from .models import Envelope
from .transport import ApiResponse, RequestOptions


class QuickReplyMutation(TypedDict):
    shortcut: str
    message: str
    keywords: NotRequired[list[str]]
    count: NotRequired[int]


class QuickReply(QuickReplyMutation):
    id: str


class ObservedQuickReply(QuickReply):
    associatedLabelIds: list[str]
    observedAt: str


class QuickReplyCollection(TypedDict):
    policy: Literal["off", "events", "cache"]
    status: Literal["disabled", "unknown", "partial", "fresh"]
    unknownReason: NotRequired[Literal["observation_disabled", "not_retained", "not_observed"]]
    observedAt: NotRequired[str]
    quickReplies: list[ObservedQuickReply]


class DeletedQuickReply(TypedDict):
    id: str
    status: Literal["DELETED"]


class UserSecurityCode(TypedDict):
    id: str
    phoneNumber: NotRequired[str]
    username: NotRequired[str]
    numericCode: str
    qrCode: str


class QuickReplies(Resource):
    async def list(
        self, connection: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[QuickReplyCollection]]:
        return await self._request("GET", self._path(connection), options=options)

    async def create(
        self, connection: str, body: QuickReplyMutation, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[QuickReply]]:
        return await self._request("POST", self._path(connection), body=body, options=options)

    async def replace(
        self,
        connection: str,
        quick_reply_id: str,
        body: QuickReplyMutation,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[QuickReply]]:
        return await self._request(
            "PUT",
            self._path(connection) + "/" + segment(quick_reply_id),
            body=body,
            options=options,
        )

    async def delete(
        self, connection: str, quick_reply_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[DeletedQuickReply]]:
        return await self._request(
            "DELETE", self._path(connection) + "/" + segment(quick_reply_id), options=options
        )

    @staticmethod
    def _path(connection: str) -> str:
        return f"/messaging/{segment(connection)}/business/quick-replies"


class Users(Resource):
    async def get_security_code(
        self, connection: str, user_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[UserSecurityCode]]:
        return await self._request(
            "GET",
            f"/messaging/{segment(connection)}/users/{segment(user_id)}/security-code",
            options=options,
        )
