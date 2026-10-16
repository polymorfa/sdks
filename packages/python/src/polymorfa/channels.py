"""WhatsApp Channels with typed position cursors and action responses."""

from __future__ import annotations

import builtins
from collections.abc import Mapping
from typing import Generic, Literal, TypeVar, cast

from typing_extensions import NotRequired, TypedDict

from .messaging import O, Resource, segment
from .models import AsyncAccepted, ConversationIdentity, Envelope, Success, WhatsAppMessageIds
from .transport import ApiResponse, QueryValue, RequestOptions


class Channel(TypedDict, total=False):
    id: str
    name: str
    description: str
    profileUrl: str
    followers: int
    muted: bool
    preview: bool


class CreateChannel(TypedDict):
    name: str
    description: NotRequired[str]
    picture: NotRequired[str]


class ChannelMessage(TypedDict):
    position: int
    id: str
    whatsapp_ids: WhatsAppMessageIds
    whatsapp_id: NotRequired[str]
    conversation: ConversationIdentity
    type: str
    timestamp: str
    views: int
    reactionCounts: dict[str, int]
    text: NotRequired[str]


class MessagesParams(TypedDict, total=False):
    count: int
    before: int


class UpdatesParams(TypedDict, total=False):
    count: int
    since: int
    after: int


class ChannelReaction(TypedDict):
    reaction: str


class LiveUpdates(TypedDict):
    durationSeconds: int


Status = TypeVar("Status", bound=str)


class ActionResult(TypedDict, Generic[Status]):
    status: Status


class Channels(Resource):
    async def list(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[Channel]]]:
        return await self._request("GET", self._path(session), options=options)

    async def create(
        self, session: str, body: CreateChannel, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Channel] | Envelope[AsyncAccepted]]:
        return await self._request("POST", self._path(session), body=body, options=options)

    async def retrieve(
        self, session: str, channel_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Channel]]:
        return await self._request("GET", self._path(session, channel_id), options=options)

    async def delete(
        self, session: str, channel_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ActionResult[Literal["DELETED"]]] | Envelope[AsyncAccepted]]:
        return await self._request("DELETE", self._path(session, channel_id), options=options)

    async def list_messages(
        self,
        session: str,
        channel_id: str,
        params: MessagesParams | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[builtins.list[ChannelMessage]]]:
        return await self._request(
            "GET",
            self._path(session, channel_id) + "/messages",
            query=cast(Mapping[str, QueryValue], params or {}),
            options=options,
        )

    async def list_message_updates(
        self,
        session: str,
        channel_id: str,
        params: UpdatesParams | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[builtins.list[ChannelMessage]]]:
        return await self._request(
            "GET",
            self._path(session, channel_id) + "/message-updates",
            query=cast(Mapping[str, QueryValue], params or {}),
            options=options,
        )

    async def mark_message_viewed(
        self, session: str, channel_id: str, message_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success | Envelope[ActionResult[Literal["VIEWED"]]] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST",
            self._path(session, channel_id) + "/messages/" + segment(message_id) + "/viewed",
            options=options,
        )

    async def react_to_message(
        self,
        session: str,
        channel_id: str,
        message_id: str,
        body: ChannelReaction,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[
        Success | Envelope[ActionResult[Literal["UPDATED"]]] | Envelope[AsyncAccepted]
    ]:
        return await self._request(
            "POST",
            self._path(session, channel_id) + "/messages/" + segment(message_id) + "/reaction",
            body=body,
            options=options.with_idempotency_key(),
        )

    async def subscribe_to_live_updates(
        self, session: str, channel_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[LiveUpdates] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST", self._path(session, channel_id) + "/live-updates", options=options
        )

    async def follow(
        self, session: str, channel_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[
        Success | Envelope[ActionResult[Literal["FOLLOWED"]]] | Envelope[AsyncAccepted]
    ]:
        return await self._request(
            "POST", self._path(session, channel_id) + "/follow", options=options
        )

    async def unfollow(
        self, session: str, channel_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[
        Success | Envelope[ActionResult[Literal["UNFOLLOWED"]]] | Envelope[AsyncAccepted]
    ]:
        return await self._request(
            "POST", self._path(session, channel_id) + "/unfollow", options=options
        )

    async def mute(
        self, session: str, channel_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success | Envelope[ActionResult[Literal["MUTED"]]] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST", self._path(session, channel_id) + "/mute", options=options
        )

    async def unmute(
        self, session: str, channel_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[
        Success | Envelope[ActionResult[Literal["UNMUTED"]]] | Envelope[AsyncAccepted]
    ]:
        return await self._request(
            "POST", self._path(session, channel_id) + "/unmute", options=options
        )

    @staticmethod
    def _path(session: str, channel_id: str | None = None) -> str:
        root = f"/messaging/{segment(session)}/channels"
        return root + "/" + segment(channel_id) if channel_id is not None else root
