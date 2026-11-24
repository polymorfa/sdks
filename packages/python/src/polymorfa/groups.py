"""Typed group membership, administration, invitations and stored capabilities."""

from __future__ import annotations

import builtins

from .campaign_contract_response import acknowledged
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


def group_path(connection: str, group_id: str | None = None) -> str:
    return (
        "/messaging/"
        + segment(connection)
        + "/groups"
        + ("" if group_id is None else "/" + segment(group_id))
    )


class Groups(Resource):
    async def list(
        self, connection: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[Group]]]:
        return await self._request("GET", group_path(connection), options=options)

    async def create(
        self, connection: str, body: GroupCreate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Group]]:
        return await self._request("POST", group_path(connection), body=body, options=options)

    async def get_join_info(
        self, connection: str, code: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[GroupInviteInfo]]:
        return await self._request(
            "GET", group_path(connection) + "/join-info", query={"code": code}, options=options
        )

    async def join(
        self, connection: str, body: InviteCode, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(connection) + "/join", body=body, options=options
        )

    async def retrieve(
        self, connection: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Group]]:
        return await self._request("GET", group_path(connection, group_id), options=options)

    @acknowledged()
    async def get_capabilities(
        self, connection: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[GroupCapabilities]]:
        return await self._request(
            "GET", group_path(connection, group_id) + "/capabilities", options=options
        )

    async def delete(
        self, connection: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request("DELETE", group_path(connection, group_id), options=options)

    async def leave(
        self, connection: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(connection, group_id) + "/leave", options=options
        )

    async def set_subject(
        self, connection: str, group_id: str, body: StringValue, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", group_path(connection, group_id) + "/subject", body=body, options=options
        )

    async def set_description(
        self, connection: str, group_id: str, body: StringValue, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", group_path(connection, group_id) + "/description", body=body, options=options
        )

    async def get_invite_code(
        self, connection: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[InviteCode]]:
        return await self._request(
            "GET", group_path(connection, group_id) + "/invite-code", options=options
        )

    async def revoke_invite_code(
        self, connection: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[InviteCode]]:
        return await self._request(
            "POST", group_path(connection, group_id) + "/invite-code/revoke", options=options
        )

    async def list_participants(
        self, connection: str, group_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[GroupParticipant]]]:
        return await self._request(
            "GET", group_path(connection, group_id) + "/participants", options=options
        )

    async def add_participants(
        self,
        connection: str,
        group_id: str,
        body: GroupParticipants,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST",
            group_path(connection, group_id) + "/participants/add",
            body=body,
            options=options,
        )

    async def remove_participants(
        self,
        connection: str,
        group_id: str,
        body: GroupParticipants,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST",
            group_path(connection, group_id) + "/participants/remove",
            body=body,
            options=options,
        )

    async def promote_participants(
        self,
        connection: str,
        group_id: str,
        body: GroupParticipants,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(connection, group_id) + "/admin/promote", body=body, options=options
        )

    async def demote_participants(
        self,
        connection: str,
        group_id: str,
        body: GroupParticipants,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", group_path(connection, group_id) + "/admin/demote", body=body, options=options
        )

    async def set_picture(
        self, connection: str, group_id: str, body: PictureSource, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", group_path(connection, group_id) + "/picture", body=body, options=options
        )

    async def set_info_editing(
        self, connection: str, group_id: str, body: AdminOnly, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            group_path(connection, group_id) + "/settings/info-edit",
            body=body,
            options=options,
        )

    async def set_messaging(
        self, connection: str, group_id: str, body: AdminOnly, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            group_path(connection, group_id) + "/settings/messages",
            body=body,
            options=options,
        )

    async def set_member_add_mode(
        self, connection: str, group_id: str, body: MemberAddMode, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            group_path(connection, group_id) + "/settings/member-add",
            body=body,
            options=options,
        )

    async def set_join_approval(
        self, connection: str, group_id: str, body: JoinApproval, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            group_path(connection, group_id) + "/settings/join-approval",
            body=body,
            options=options,
        )
