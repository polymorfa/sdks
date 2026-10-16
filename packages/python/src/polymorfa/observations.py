"""Identity resolution, privacy and policy-governed label observations."""

from __future__ import annotations

import builtins
from typing import Literal

from .errors import ValidationError
from .messaging import O, Resource, segment
from .models import (
    Envelope,
    IdentityResult,
    Label,
    LabelCollection,
    LabelCreate,
    LabelUpdate,
    PrivacySettings,
    ResolveIdentity,
    Success,
)
from .transport import ApiResponse, RequestOptions


class Identities(Resource):
    async def resolve(
        self, session: str, params: ResolveIdentity, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[IdentityResult]]:
        if sum(bool(params.get(k)) for k in ("phoneNumber", "id", "username")) != 1 or (
            "usernameKey" in params and "username" not in params
        ):
            raise ValidationError("Choose one identity selector.", code="invalid_request")
        return await self._request(
            "GET",
            "/messaging/" + segment(session) + "/identities/resolve",
            query={
                "phoneNumber": params.get("phoneNumber"),
                "id": params.get("id"),
                "username": params.get("username"),
                "usernameKey": params.get("usernameKey"),
            },
            options=options,
        )


class Labels(Resource):
    def _path(self, session: str) -> str:
        return "/messaging/" + segment(session) + "/labels"

    async def list(
        self, session: str, *, include_observation: bool | None = None, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[Label] | LabelCollection]]:
        return await self._request(
            "GET",
            self._path(session),
            query={"includeObservation": include_observation},
            options=options,
        )

    async def create(
        self, session: str, body: LabelCreate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Label]]:
        return await self._request("POST", self._path(session), body=body, options=options)

    async def update(
        self, session: str, label_id: str, body: LabelUpdate, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        if not body:
            raise ValidationError("A label update requires name or color.", code="invalid_request")
        return await self._request(
            "PUT", self._path(session) + "/" + segment(label_id), body=body, options=options
        )

    async def delete(
        self, session: str, label_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "DELETE", self._path(session) + "/" + segment(label_id), options=options
        )

    async def list_for_chat(
        self,
        session: str,
        chat_id: str,
        *,
        include_observation: bool | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[builtins.list[Label] | LabelCollection]]:
        return await self._request(
            "GET",
            self._path(session) + "/chats/" + segment(chat_id),
            query={"includeObservation": include_observation},
            options=options,
        )

    async def replace_for_chat(
        self, session: str, chat_id: str, labels: builtins.list[str], *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            self._path(session) + "/chats/" + segment(chat_id),
            body={"labels": labels},
            options=options,
        )


class Privacy(Resource):
    async def get(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PrivacySettings]]:
        return await self._request(
            "GET", "/messaging/" + segment(session) + "/privacy", options=options
        )

    async def set(
        self,
        session: str,
        setting: Literal[
            "groupadd",
            "last",
            "status",
            "profile",
            "readreceipts",
            "online",
            "calladd",
            "messages",
            "defense",
            "stickers",
        ],
        value: Literal[
            "all",
            "contacts",
            "contact_blacklist",
            "none",
            "match_last_seen",
            "known",
            "on_standard",
            "off",
            "contact_allowlist",
        ],
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[PrivacySettings]]:
        allowed = {
            "groupadd": ("all", "contacts", "contact_blacklist", "none"),
            "last": ("all", "contacts", "contact_blacklist", "none"),
            "status": ("all", "contacts", "contact_blacklist", "none"),
            "profile": ("all", "contacts", "contact_blacklist", "none"),
            "readreceipts": ("all", "none"),
            "online": ("all", "match_last_seen"),
            "calladd": ("all", "known"),
            "messages": ("all", "contacts"),
            "defense": ("on_standard", "off"),
            "stickers": ("contacts", "contact_allowlist", "none"),
        }
        if value not in allowed.get(setting, ()):
            raise ValidationError("Invalid privacy value for setting.", code="invalid_request")
        return await self._request(
            "PUT",
            "/messaging/" + segment(session) + "/privacy/" + segment(setting),
            body={"value": value},
            options=options,
        )

    async def set_default_disappearing_timer(
        self, session: str, duration_seconds: int, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            "/messaging/" + segment(session) + "/privacy/disappearing/default",
            body={"durationSeconds": duration_seconds},
            options=options,
        )
