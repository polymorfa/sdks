"""Typed group membership, administration, invitations and stored capabilities."""

from __future__ import annotations

import builtins

from .messaging import O, Resource, segment
from .models import (
    AdminOnly,
    Envelope,
    Group,
    GroupCapabilities,
    GroupCreate,
    GroupInviteInfo,
    GroupParticipant,
    GroupParticipants,
    InviteCode,
    JoinApproval,
    MemberAddMode,
    PictureSource,
    StringValue,
    Success,
)
from .transport import ApiResponse, RequestOptions


def group_path(session: str, group_id: str | None = None) -> str:
    return (
        "/messaging/"
        + segment(session)
        + "/groups"
        + ("" if group_id is None else "/" + segment(group_id))
    )


class Groups(Resource):
    async def list(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[Group]]]:
        return await self._request("GET", group_path(session), options=options)

    async def create(
        self, session: str, body: GroupCreate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Group]]:
        return await self._request("POST", group_path(session), body=body, options=options)

    async def get_join_info(
        self, session: str, code: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[GroupInviteInfo]]:
        return await self._request(
            "GET", group_path(session) + "/join-info", query={"code": code}, options=options
        )

    async def join(
        self, session: str, body: InviteCode, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(session) + "/join", body=body, options=options
        )

    async def retrieve(
        self, session: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Group]]:
        return await self._request("GET", group_path(session, group_id), options=options)

    async def get_capabilities(
        self, session: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[GroupCapabilities]]:
        return await self._request(
            "GET", group_path(session, group_id) + "/capabilities", options=options
        )

    async def delete(
        self, session: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request("DELETE", group_path(session, group_id), options=options)

    async def leave(
        self, session: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(session, group_id) + "/leave", options=options
        )

    async def set_subject(
        self, session: str, group_id: str, body: StringValue, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", group_path(session, group_id) + "/subject", body=body, options=options
        )

    async def set_description(
        self, session: str, group_id: str, body: StringValue, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", group_path(session, group_id) + "/description", body=body, options=options
        )

    async def get_invite_code(
        self, session: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[InviteCode]]:
        return await self._request(
            "GET", group_path(session, group_id) + "/invite-code", options=options
        )

    async def revoke_invite_code(
        self, session: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[InviteCode]]:
        return await self._request(
            "POST", group_path(session, group_id) + "/invite-code/revoke", options=options
        )

    async def list_participants(
        self, session: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[GroupParticipant]]]:
        return await self._request(
            "GET", group_path(session, group_id) + "/participants", options=options
        )

    async def add_participants(
        self, session: str, group_id: str, body: GroupParticipants, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(session, group_id) + "/participants/add", body=body, options=options
        )

    async def remove_participants(
        self, session: str, group_id: str, body: GroupParticipants, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST",
            group_path(session, group_id) + "/participants/remove",
            body=body,
            options=options,
        )

    async def promote_participants(
        self, session: str, group_id: str, body: GroupParticipants, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(session, group_id) + "/admin/promote", body=body, options=options
        )

    async def demote_participants(
        self, session: str, group_id: str, body: GroupParticipants, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(session, group_id) + "/admin/demote", body=body, options=options
        )

    async def set_picture(
        self, session: str, group_id: str, body: PictureSource, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", group_path(session, group_id) + "/picture", body=body, options=options
        )

    async def set_info_editing(
        self, session: str, group_id: str, body: AdminOnly, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", group_path(session, group_id) + "/settings/info-edit", body=body, options=options
        )

    async def set_messaging(
        self, session: str, group_id: str, body: AdminOnly, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", group_path(session, group_id) + "/settings/messages", body=body, options=options
        )

    async def set_member_add_mode(
        self, session: str, group_id: str, body: MemberAddMode, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            group_path(session, group_id) + "/settings/member-add",
            body=body,
            options=options,
        )

    async def set_join_approval(
        self, session: str, group_id: str, body: JoinApproval, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            group_path(session, group_id) + "/settings/join-approval",
            body=body,
            options=options,
        )
