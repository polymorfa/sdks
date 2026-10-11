"""Handwritten Messaging resources; response envelopes retain server extensions."""

from __future__ import annotations

import builtins
import math
from collections.abc import Mapping
from dataclasses import replace
from typing import Literal, TypeVar, cast
from urllib.parse import quote

from .errors import ConfigurationError, ValidationError
from .models import (
    AsyncAccepted,
    BusinessProfile,
    CallAcceptance,
    CallAcceptanceResult,
    CallPlacement,
    CallPlacementResult,
    CallSettings,
    ChatPresenceData,
    Contact,
    ContactBlocklist,
    ContactCheck,
    ContactInfo,
    ContactPicture,
    DataEnvelope,
    Envelope,
    HistoryChat,
    HistoryChatsParams,
    HistoryMessage,
    HistoryMessagesParams,
    HistoryPage,
    MessageOperation,
    MessageReceipt,
    MessageResponse,
    OperationAccepted,
    PairCode,
    PairCodeResult,
    PictureSource,
    PlatformSession,
    PresenceData,
    PresenceSetResult,
    PresenceSubscription,
    Profile,
    QrCode,
    QuickLink,
    QuickLinkInput,
    QuickLinkStatus,
    Reaction,
    Seen,
    SendMessage,
    Session,
    SessionAccount,
    SessionRemoved,
    SessionStarting,
    SessionStopping,
    SessionUpdate,
    Star,
    StarResult,
    StatusResult,
    Success,
    Typing,
    Webhook,
    WebhookCreate,
    WebhookUpdate,
)
from .transport import ApiResponse, JsonObject, QueryValue, RequestOptions, Transport

T = TypeVar("T")
O = RequestOptions()


def segment(value: str) -> str:
    if not value:
        raise ConfigurationError("identifier")
    return quote(value, safe="")


class Resource:
    def __init__(self, transport: Transport, credential_kind: str) -> None:
        self._transport, self._kind = transport, credential_kind

    def _server(self) -> None:
        if self._kind == "client_token":
            raise ConfigurationError("credential")

    async def _request(
        self,
        method: str,
        path: str,
        *,
        body: object = None,
        query: Mapping[str, QueryValue] | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[T]:
        return cast(
            ApiResponse[T],
            await self._transport.request(method, path, body=body, query=query, options=options),
        )


class Messages(Resource):
    async def send(
        self, session: str, body: SendMessage, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[MessageResponse]]:
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/messages/send",
            body=body,
            options=options.with_idempotency_key(),
        )

    async def react(
        self, session: str, body: Reaction, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[MessageReceipt]]:
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/messages/react",
            body=body,
            options=options.with_idempotency_key(),
        )

    async def mark_seen(
        self, session: str, body: Seen, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[StatusResult]]:
        return await self._request(
            "POST", f"/messaging/{segment(session)}/messages/seen", body=body, options=options
        )

    async def set_typing(
        self, session: str, body: Typing, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[StatusResult]]:
        return await self._request(
            "POST", f"/messaging/{segment(session)}/messages/typing", body=body, options=options
        )

    async def star(
        self, session: str, body: Star, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[StarResult]]:
        return await self._request(
            "POST", f"/messaging/{segment(session)}/messages/star", body=body, options=options
        )

    async def operation_status(
        self, session: str, operation_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[MessageOperation]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/operations/{segment(operation_id)}",
            options=options,
        )


class Sessions(Resource):
    async def list(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[builtins.list[PlatformSession]]]:
        self._server()
        return await self._request("GET", "/platform/sessions", options=options)

    async def retrieve(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Session]]:
        self._server()
        return await self._request("GET", f"/platform/sessions/{segment(session)}", options=options)

    async def update(
        self, session: str, body: SessionUpdate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Session]]:
        self._server()
        return await self._request(
            "PUT", f"/platform/sessions/{segment(session)}", body=body, options=options
        )

    async def delete(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionRemoved]]:
        self._server()
        return await self._request(
            "DELETE", f"/platform/sessions/{segment(session)}", options=options
        )

    async def start(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionStarting]]:
        self._server()
        return await self._request(
            "POST", f"/platform/sessions/{segment(session)}/start", options=options
        )

    async def stop(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[DataEnvelope[SessionStopping]]:
        self._server()
        return await self._request(
            "POST", f"/platform/sessions/{segment(session)}/stop", options=options
        )

    async def restart(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[OperationAccepted]:
        self._server()
        return await self._request(
            "POST", f"/platform/sessions/{segment(session)}/restart", options=options
        )

    async def logout(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[OperationAccepted]:
        self._server()
        return await self._request(
            "POST", f"/platform/sessions/{segment(session)}/logout", options=options
        )

    async def account(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[SessionAccount]]:
        self._server()
        return await self._request(
            "GET", f"/platform/sessions/{segment(session)}/me", options=options
        )

    async def qr(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[QrCode]]:
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/pair/qr",
            query={"format": "json"},
            options=options,
        )

    async def request_pairing_code(
        self, session: str, body: PairCode, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PairCodeResult]]:
        return await self._request(
            "POST", f"/messaging/{segment(session)}/pair/code", body=body, options=options
        )

    async def get_meta_pricing(
        self,
        session: str,
        *,
        query: Mapping[str, QueryValue] | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[JsonObject]]:
        self._server()
        return await self._request(
            "GET", f"/messaging/{segment(session)}/meta-pricing", query=query, options=options
        )

    async def get_cloud_credential_health(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[JsonObject]]:
        self._server()
        return await self._request(
            "GET", f"/messaging/{segment(session)}/cloud-credentials", options=options
        )

    async def reauthorize_cloud_credentials(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[JsonObject]]:
        self._server()
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/cloud-credentials/reauthorize",
            options=replace(options, max_network_retries=0),
        )


class QuickLinks(Resource):
    async def create(
        self, body: QuickLinkInput | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[QuickLink]]:
        self._server()
        value = body or {}
        if value.get("purpose") == "add_connection" and not value.get("session"):
            raise ValidationError("An add_connection QuickLink requires session.")
        billing = value.get("billingControls")
        if billing is not None:
            limit, priority = billing.get("limitCredits"), billing.get("priority")
            config = value.get("configuration", {})
            if (
                value.get("purpose") == "add_connection"
                or config.get("testing") is not None
                or (
                    limit is not None
                    and (
                        isinstance(limit, bool)
                        or not isinstance(limit, (int, float))
                        or not math.isfinite(limit)
                        or not 0 <= limit <= 1_000_000
                        or abs(limit * 1_000_000 - round(limit * 1_000_000)) > 1e-6
                    )
                )
                or isinstance(priority, bool)
                or not isinstance(priority, int)
                or not 0 <= priority <= 1_000_000
            ):
                raise ValidationError("Invalid initial billing controls.")
        return await self._request("POST", "/messaging/quicklinks", body=value, options=options)

    async def availability(
        self, project_id: str, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[JsonObject]]:
        self._server()
        return await self._request(
            "GET",
            "/messaging/quicklinks/availability",
            query={"projectId": project_id, "session": session},
            options=options,
        )

    async def retrieve(
        self, link_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[QuickLinkStatus]]:
        self._server()
        return await self._request(
            "GET", f"/messaging/quicklinks/{segment(link_id)}", options=options
        )

    async def cancel(self, link_id: str, *, options: RequestOptions = O) -> ApiResponse[Success]:
        self._server()
        return await self._request(
            "DELETE", f"/messaging/quicklinks/{segment(link_id)}", options=options
        )


class Webhooks(Resource):
    async def list(
        self, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[Webhook]]]:
        return await self._request("GET", "/messaging/webhooks", options=options)

    async def create(
        self, body: WebhookCreate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Webhook]]:
        return await self._request("POST", "/messaging/webhooks", body=body, options=options)

    async def retrieve(
        self, webhook_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Webhook]]:
        return await self._request(
            "GET", f"/messaging/webhooks/{segment(webhook_id)}", options=options
        )

    async def update(
        self, webhook_id: str, body: WebhookUpdate, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Webhook]]:
        return await self._request(
            "PUT", f"/messaging/webhooks/{segment(webhook_id)}", body=body, options=options
        )

    async def delete(self, webhook_id: str, *, options: RequestOptions = O) -> ApiResponse[Success]:
        return await self._request(
            "DELETE", f"/messaging/webhooks/{segment(webhook_id)}", options=options
        )


class Chats(Resource):
    def _path(self, session: str, conversation: str) -> str:
        return f"/messaging/{segment(session)}/chats/{segment(conversation)}"

    async def list(
        self, session: str, params: HistoryChatsParams | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[HistoryPage[HistoryChat]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/chats",
            query=cast(Mapping[str, QueryValue], params or {}),
            options=options,
        )

    async def retrieve(
        self, session: str, conversation: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[HistoryChat]]:
        self._server()
        return await self._request("GET", self._path(session, conversation), options=options)

    async def list_messages(
        self,
        session: str,
        conversation: str,
        params: HistoryMessagesParams | None = None,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[HistoryPage[HistoryMessage]]:
        self._server()
        return await self._request(
            "GET",
            self._path(session, conversation) + "/messages",
            query=cast(Mapping[str, QueryValue], params or {}),
            options=options,
        )

    async def retrieve_message(
        self, session: str, conversation: str, message_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[HistoryMessage]]:
        self._server()
        return await self._request(
            "GET",
            self._path(session, conversation) + "/messages/" + segment(message_id),
            options=options,
        )

    async def download_message_media(
        self, session: str, conversation: str, message_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[bytes]:
        self._server()
        return await self._transport.binary(
            self._path(session, conversation) + "/messages/" + segment(message_id) + "/media",
            options=options,
        )

    async def edit_message(
        self,
        session: str,
        conversation: str,
        message_id: str,
        body: JsonObject,
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            self._path(session, conversation) + "/messages/" + segment(message_id),
            body=body,
            options=options.with_idempotency_key(),
        )

    async def delete_message(
        self,
        session: str,
        conversation: str,
        message_id: str,
        *,
        transport: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Success]:
        return await self._request(
            "DELETE",
            self._path(session, conversation) + "/messages/" + segment(message_id),
            query={"transport": transport},
            options=options.with_idempotency_key(),
        )

    async def archive(
        self, session: str, conversation: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", self._path(session, conversation) + "/archive", options=options
        )

    async def unarchive(
        self, session: str, conversation: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", self._path(session, conversation) + "/unarchive", options=options
        )

    async def set_disappearing_timer(
        self, session: str, conversation: str, duration_seconds: int, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            self._path(session, conversation) + "/disappearing",
            body={"durationSeconds": duration_seconds},
            options=options,
        )

    async def get_service_window(
        self, session: str, conversation: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[JsonObject]]:
        self._server()
        return await self._request(
            "GET", self._path(session, conversation) + "/service-window", options=options
        )


class Media(Resource):
    async def download(self, media_id: str, *, options: RequestOptions = O) -> ApiResponse[bytes]:
        return await self._transport.binary(
            f"/messaging/media/{segment(media_id)}", options=options
        )

    async def retrieve(
        self, media_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[JsonObject]]:
        return await self._request(
            "GET", f"/messaging/media/{segment(media_id)}/info", options=options
        )

    async def persist(self, media_id: str, *, options: RequestOptions = O) -> ApiResponse[Success]:
        return await self._request(
            "POST", f"/messaging/media/{segment(media_id)}/download-and-save", options=options
        )


class Contacts(Resource):
    def _path(self, session: str, contact_id: str | None = None) -> str:
        return f"/messaging/{segment(session)}/contacts" + (
            "/" + segment(contact_id) if contact_id else ""
        )

    async def list(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[Contact]]]:
        return await self._request("GET", self._path(session), options=options)

    async def retrieve(
        self, session: str, contact_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Contact]]:
        return await self._request("GET", self._path(session, contact_id), options=options)

    async def check(
        self, session: str, phone: str | builtins.list[str], *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[ContactCheck]]]:
        return await self._request(
            "GET",
            self._path(session) + "/check",
            query={"phone": phone if isinstance(phone, str) else ",".join(phone)},
            options=options,
        )

    async def blocklist(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ContactBlocklist]]:
        return await self._request("GET", self._path(session) + "/blocked", options=options)

    async def picture(
        self, session: str, contact_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ContactPicture]]:
        return await self._request(
            "GET", self._path(session, contact_id) + "/picture", options=options
        )

    async def info(
        self, session: str, contact_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ContactInfo]]:
        return await self._request(
            "GET", self._path(session, contact_id) + "/info", options=options
        )

    async def devices(
        self, session: str, contact_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[builtins.list[str]]]:
        return await self._request(
            "GET", self._path(session, contact_id) + "/devices", options=options
        )

    async def business_profile(
        self, session: str, contact_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[BusinessProfile]]:
        return await self._request(
            "GET", self._path(session, contact_id) + "/business-profile", options=options
        )

    async def block(
        self, session: str, contact_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", self._path(session, contact_id) + "/block", options=options
        )

    async def unblock(
        self, session: str, contact_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST", self._path(session, contact_id) + "/unblock", options=options
        )


class Profiles(Resource):
    async def get(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[Profile]]:
        return await self._request("GET", f"/messaging/{segment(session)}/profile", options=options)

    async def set_name(
        self, session: str, name: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            f"/messaging/{segment(session)}/profile/name",
            body={"name": name},
            options=options,
        )

    async def set_status(
        self, session: str, status: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            f"/messaging/{segment(session)}/profile/status",
            body={"status": status},
            options=options,
        )

    async def set_picture(
        self, session: str, body: PictureSource, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT", f"/messaging/{segment(session)}/profile/picture", body=body, options=options
        )

    async def delete_picture(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "DELETE", f"/messaging/{segment(session)}/profile/picture", options=options
        )


class Presence(Resource):
    async def set(
        self,
        session: str,
        presence: Literal["available", "unavailable"],
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Success | Envelope[PresenceSetResult] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/presence",
            body={"presence": presence},
            options=options,
        )

    async def get(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PresenceData]]:
        return await self._request(
            "GET", f"/messaging/{segment(session)}/presence", options=options
        )

    async def get_for_chat(
        self, session: str, chat_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[ChatPresenceData]]:
        return await self._request(
            "GET", f"/messaging/{segment(session)}/presence/{segment(chat_id)}", options=options
        )

    async def subscribe(
        self, session: str, chat_id: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PresenceSubscription] | Envelope[AsyncAccepted]]:
        return await self._request(
            "POST",
            f"/messaging/{segment(session)}/presence/{segment(chat_id)}/subscribe",
            options=options,
        )


class Voip(Resource):
    def _participant(self, participant: str | None) -> None:
        import re

        if participant is not None and (
            self._kind == "client_token"
            or not re.fullmatch(r"[A-Za-z0-9._:@-]{1,128}", participant)
        ):
            raise ValidationError("Invalid participant.")

    async def place(
        self, body: CallPlacement, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CallPlacementResult]]:
        import re

        if self._kind != "client_token" and not body.get("session"):
            raise ValidationError("A server call requires session.")
        self._participant(body.get("participant"))
        to, participants, group = body.get("to"), body.get("participants"), body.get("groupId")

        def valid(value: object) -> bool:
            return isinstance(value, str) and bool(
                re.fullmatch(r"(?:\+[1-9]\d{1,14}|[1-9][0-9]{0,18})", value)
            )

        if group is not None:
            if (
                to is not None
                or participants is not None
                or not re.fullmatch(r"[1-9][0-9]{0,18}", group)
            ):
                raise ValidationError("Provide groupId without to or participants.")
        elif participants is not None:
            if (
                to is not None
                or not 2 <= len(participants) <= 31
                or len(set(participants)) != len(participants)
                or not all(valid(value) for value in participants)
            ):
                raise ValidationError("Provide 2 to 31 distinct participants.")
        elif not valid(to):
            raise ValidationError("Provide a valid call target.")
        return await self._request("POST", "/messaging/voip/calls", body=body, options=options)

    async def accept(
        self, call_id: str, body: CallAcceptance | None = None, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CallAcceptanceResult]]:
        self._participant((body or {}).get("participant"))
        return await self._request(
            "POST",
            f"/messaging/voip/calls/{segment(call_id)}/accept",
            body=body or {},
            options=options,
        )

    async def reject(
        self, call_id: str, *, participant: str | None = None, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        self._participant(participant)
        return await self._request(
            "POST",
            f"/messaging/voip/calls/{segment(call_id)}/reject",
            body=None if participant is None else {"participant": participant},
            options=options,
        )

    async def leave(
        self,
        call_id: str,
        connection_id: str,
        *,
        participant: str | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Success]:
        import re

        self._participant(participant)
        if not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", connection_id):
            raise ValidationError("Invalid connectionId.")
        body = {"connectionId": connection_id}
        if participant is not None:
            body["participant"] = participant
        return await self._request(
            "POST", f"/messaging/voip/calls/{segment(call_id)}/leave", body=body, options=options
        )

    async def end(self, call_id: str, *, options: RequestOptions = O) -> ApiResponse[Success]:
        return await self._request(
            "DELETE", f"/messaging/voip/calls/{segment(call_id)}", options=options
        )

    async def add_participant(
        self, call_id: str, to: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[JsonObject]]:
        return await self._request(
            "POST",
            f"/messaging/voip/calls/{segment(call_id)}/participants",
            body={"to": to},
            options=options,
        )

    async def ring_participant(
        self, call_id: str, to: str, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        return await self._request(
            "POST",
            f"/messaging/voip/calls/{segment(call_id)}/participants/ring",
            body={"to": to},
            options=options,
        )

    async def retrieve_call_permission(
        self, session: str, to: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[JsonObject]]:
        self._server()
        return await self._request(
            "GET", f"/messaging/{segment(session)}/call-permissions/{segment(to)}", options=options
        )

    async def retrieve_call_settings(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CallSettings]]:
        self._server()
        return await self._request(
            "GET", f"/platform/sessions/{segment(session)}/call-settings", options=options
        )

    async def update_call_settings(
        self, session: str, body: CallSettings, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CallSettings]]:
        self._server()
        if not body or "includeSelfAudio" in body:
            raise ValidationError("Provide a supported call setting.")
        for key in ("callsEnabled", "conferenceMode", "sipClaim", "hostCloudApiCalls"):
            if key in body and not isinstance(body[key], bool):
                raise ValidationError("Call switches must be booleans.")
        return await self._request(
            "PUT",
            f"/platform/sessions/{segment(session)}/call-settings",
            body=body,
            options=options,
        )
