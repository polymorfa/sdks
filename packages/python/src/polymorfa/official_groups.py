"""Official API groups with single-attempt provider mutations."""

from __future__ import annotations

import builtins
from dataclasses import replace
from typing import Literal

from typing_extensions import NotRequired, TypedDict

from .messaging import O, Resource, segment
from .models import Conversation, Envelope
from .transport import ApiResponse, RequestOptions


class Cursors(TypedDict, total=False):
    before: str
    after: str


class GroupSummary(TypedDict):
    id: str
    subject: NotRequired[str]
    createdAt: NotRequired[str]


class GroupList(TypedDict):
    groups: list[GroupSummary]
    cursors: Cursors
    hasMore: bool


class OfficialGroup(GroupSummary):
    description: NotRequired[str]
    suspended: NotRequired[bool]
    participantCount: NotRequired[int]
    joinApprovalRequired: NotRequired[bool]
    participants: list[Conversation]


class CreateGroup(TypedDict):
    subject: str
    description: NotRequired[str]
    joinApprovalRequired: NotRequired[bool]


class UpdateGroup(TypedDict, total=False):
    subject: str
    description: str


class CreatedGroup(TypedDict):
    requestId: str


class AcceptedChange(TypedDict):
    accepted: Literal[True]


class InviteLink(TypedDict):
    inviteLink: str


class JoinRequest(TypedDict):
    joinRequestId: str
    user: Conversation
    createdAt: NotRequired[str]


class JoinRequests(TypedDict):
    items: list[JoinRequest]
    cursors: Cursors
    hasMore: bool


class DecisionError(TypedDict):
    code: int
    title: NotRequired[str]


class FailedDecision(TypedDict):
    joinRequestId: str
    errors: list[DecisionError]


class JoinDecision(TypedDict):
    succeeded: builtins.list[str]
    failed: list[FailedDecision]


class PinMessage(TypedDict):
    operation: Literal["pin"]
    messageId: str
    expirationDays: int


class UnpinMessage(TypedDict):
    operation: Literal["unpin"]
    messageId: str


class OfficialGroups(Resource):
    async def list(
        self,
        session: str,
        *,
        limit: int | None = None,
        before: str | None = None,
        after: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[GroupList]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/official-groups",
            query={"limit": limit, "before": before, "after": after},
            options=options,
        )

    async def create(
        self, session: str, body: CreateGroup, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CreatedGroup]]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/official-groups",
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def retrieve(
        self, session: str, group: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[OfficialGroup]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}",
            options=options,
        )

    async def update(
        self, session: str, group: str, body: UpdateGroup, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[AcceptedChange]]:
        self._server()
        return await self._request(
            "PATCH",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}",
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def delete(
        self, session: str, group: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[AcceptedChange]]:
        self._server()
        return await self._request(
            "DELETE",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}",
            options=replace(options, max_network_retries=0),
        )

    async def get_invite_link(
        self, session: str, group: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[InviteLink]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}/invite-link",
            options=options,
        )

    async def reset_invite_link(
        self, session: str, group: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[InviteLink]]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}/invite-link/reset",
            options=replace(options, max_network_retries=0),
        )

    async def remove_participants(
        self,
        session: str,
        group: str,
        participants: builtins.list[str],
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[AcceptedChange]]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}/participants/remove",
            body={"participants": participants},
            options=replace(options, max_network_retries=0),
        )

    async def list_join_requests(
        self,
        session: str,
        group: str,
        *,
        before: str | None = None,
        after: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[JoinRequests]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}/join-requests",
            query={"before": before, "after": after},
            options=options,
        )

    async def approve_join_requests(
        self,
        session: str,
        group: str,
        join_request_ids: builtins.list[str],
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[JoinDecision]]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}/join-requests/approve",
            body={"joinRequestIds": join_request_ids},
            options=replace(options, max_network_retries=0),
        )

    async def reject_join_requests(
        self,
        session: str,
        group: str,
        join_request_ids: builtins.list[str],
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[JoinDecision]]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}/join-requests/reject",
            body={"joinRequestIds": join_request_ids},
            options=replace(options, max_network_retries=0),
        )

    async def pin(
        self,
        session: str,
        group: str,
        body: PinMessage | UnpinMessage,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[AcceptedChange]]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/official-groups/{segment(group)}/pins",
            body=body,
            options=replace(options, max_network_retries=0),
        )
