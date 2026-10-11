"""Handwritten Messaging resources; response envelopes retain server extensions."""

from __future__ import annotations

import builtins
import math
import re
from collections.abc import Mapping
from dataclasses import replace
from typing import Literal, TypeVar, cast
from urllib.parse import quote

from .cloud import (
    CloudCredentialHealth,
    CloudReauthorization,
    MetaPricingParams,
    MetaPricingSummary,
)
from .errors import ConfigurationError, ValidationError
from .models import (
    AsyncAccepted,
    BusinessProfile,
    CallAcceptance,
    CallAcceptanceResult,
    CallPlacement,
    CallPlacementResult,
    ChatPresenceData,
    Contact,
    ContactBlocklist,
    ContactCheck,
    ContactInfo,
    ContactPicture,
    CustomerServiceWindow,
    DataEnvelope,
    EditMessage,
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
    UpdateCallSettings,
    Webhook,
    WebhookCreate,
    WebhookUpdate,
)
from .transport import ApiResponse, JsonObject, QueryValue, RequestOptions, Transport
from .voip_models import (
    CallCheck,
    CallCheckRequest,
    CallLinkRequest,
    CallParticipant,
    CallPermission,
    CallReaction,
    CallReport,
    CreatedCallLink,
    HandRaised,
    PreviewCallLinkRequest,
    PreviewedCallLink,
    SessionCallSettings,
)

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
        query: MetaPricingParams | None = None,
        options: RequestOptions = O,
    ) -> ApiResponse[Envelope[MetaPricingSummary]]:
        self._server()
        return await self._request(
            "GET",
            f"/messaging/{segment(session)}/meta-pricing",
            query=cast(Mapping[str, QueryValue], query or {}),
            options=options,
        )

    async def get_cloud_credential_health(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CloudCredentialHealth]]:
        self._server()
        return await self._request(
            "GET", f"/messaging/{segment(session)}/cloud-credentials", options=options
        )

    async def reauthorize_cloud_credentials(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CloudReauthorization]]:
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
        body: EditMessage,
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
        transport: Literal["auto", "linked_devices", "official_api"] | None = None,
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
        self,
        session: str,
        conversation: str,
        duration_seconds: Literal[0, 86400, 604800, 7776000],
        *,
        options: RequestOptions = O,
    ) -> ApiResponse[Success]:
        return await self._request(
            "PUT",
            self._path(session, conversation) + "/disappearing",
            body={"durationSeconds": duration_seconds},
            options=options,
        )

    async def get_service_window(
        self, session: str, conversation: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CustomerServiceWindow]]:
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

        if participant is not None:
            if self._kind == "client_token":
                raise ConfigurationError("participant")
            if not re.fullmatch(r"[A-Za-z0-9._:@-]{1,128}", participant):
                raise ValidationError("Invalid participant.")

    async def place(
        self, body: CallPlacement, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CallPlacementResult]]:
        import re

        if self._kind != "client_token" and not body.get("session", "").strip():
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
    ) -> ApiResponse[Envelope[CallParticipant]]:
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
    ) -> ApiResponse[Envelope[CallPermission]]:
        self._server()
        if not session.strip():
            raise ConfigurationError("session")
        if not to.strip():
            raise ConfigurationError("to")
        return await self._request(
            "GET", f"/messaging/{segment(session)}/call-permissions/{segment(to)}", options=options
        )

    async def retrieve_call_settings(
        self, session: str, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[SessionCallSettings]]:
        self._server()
        return await self._request(
            "GET", f"/platform/sessions/{segment(session)}/call-settings", options=options
        )

    async def update_call_settings(
        self, session: str, body: UpdateCallSettings, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[SessionCallSettings]]:
        self._server()
        if (
            not any(
                key in body
                for key in (
                    "callsEnabled",
                    "conferenceMode",
                    "inboundRoute",
                    "sipTrunkId",
                    "sipClaim",
                    "hostCloudApiCalls",
                )
            )
            or "includeSelfAudio" in body
        ):
            raise ValidationError("Provide a supported call setting.")
        for key in ("callsEnabled", "conferenceMode", "sipClaim", "hostCloudApiCalls"):
            if key in body and not isinstance(body[key], bool):
                raise ValidationError("Call switches must be booleans.")
        if "inboundRoute" in body and body["inboundRoute"] not in ("clients", "sip_trunk"):
            raise ValidationError("Invalid inbound call route.")
        revision = body.get("expectedRevision")
        if revision is not None and (
            isinstance(revision, bool)
            or not isinstance(revision, int)
            or not 0 <= revision <= 9007199254740991
        ):
            raise ValidationError("Invalid expected call-settings revision.")
        return await self._request(
            "PUT",
            f"/platform/sessions/{segment(session)}/call-settings",
            body=body,
            options=options,
        )

    def _call_link(self, body: CallLinkRequest, options: RequestOptions) -> None:
        self._server()
        if (
            not isinstance(body.get("session"), str)
            or not body["session"].strip()
            or len(body["session"]) > 128
            or ("video" in body and not isinstance(body["video"], bool))
        ):
            raise ValidationError("Call links require a session and optional video flag.")
        if options.idempotency_key is not None or any(
            name.lower() == "idempotency-key" for name in options.headers
        ):
            raise ValidationError("Call links do not support Idempotency-Key.")

    async def create_call_link(
        self, body: CallLinkRequest, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CreatedCallLink]]:
        self._call_link(body, options)
        return await self._request(
            "POST",
            "/messaging/voip/call-links",
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def preview_call_link(
        self, body: PreviewCallLinkRequest, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[PreviewedCallLink]]:
        self._call_link(body, options)
        if not isinstance(body.get("token"), str) or not re.fullmatch(
            r"[A-Za-z0-9_-]{1,256}", body["token"]
        ):
            raise ValidationError("Invalid call-link token.")
        return await self._request(
            "POST",
            "/messaging/voip/call-links/preview",
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def check(
        self, body: CallCheckRequest, *, options: RequestOptions = O
    ) -> ApiResponse[Envelope[CallCheck]]:
        self._server()
        if not body.get("session", "").strip() or not body.get("to", "").strip():
            raise ValidationError("Call checks require session and destination.")
        return await self._request(
            "POST", "/messaging/voip/calls/check", body=body, options=options
        )

    async def send_reaction(
        self, call_id: str, body: CallReaction, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        self._participant(body.get("participant"))
        self._connection(body.get("connectionId"))
        if body.get("emoji") not in ("", "👍", "❤️", "😂", "😮", "😢", "🙏"):
            raise ValidationError("Invalid call reaction.")
        return await self._request(
            "POST",
            f"/messaging/voip/calls/{segment(call_id)}/reaction",
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def set_hand_raised(
        self, call_id: str, body: HandRaised, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        self._participant(body.get("participant"))
        self._connection(body.get("connectionId"))
        if not isinstance(body.get("raised"), bool):
            raise ValidationError("Invalid raised hand state.")
        return await self._request(
            "POST",
            f"/messaging/voip/calls/{segment(call_id)}/hand",
            body=body,
            options=replace(options, max_network_retries=0),
        )

    async def report(
        self, call_id: str, body: CallReport, *, options: RequestOptions = O
    ) -> ApiResponse[Success]:
        value = cast(JsonObject, body)
        self._connection(value.get("connectionId"))
        kind = value.get("kind")
        if kind not in ("quality", "error") or set(value) - {
            "kind",
            "connectionId",
            "participant",
            "client",
            kind,
        }:
            raise ValidationError("Invalid call report fields.")
        client = value.get("client")
        if client is not None:
            self._report_client(client)
        if kind == "error":
            error = value.get("error")
            if (
                not isinstance(error, dict)
                or set(error) != {"code"}
                or error.get("code")
                not in (
                    "media_permission_denied",
                    "device_not_found",
                    "device_in_use",
                    "ice_failed",
                    "negotiation_failed",
                    "media_timeout",
                    "reconnect_exhausted",
                    "token_refresh_failed",
                    "unsupported_browser",
                    "other",
                )
            ):
                raise ValidationError("Invalid call report error.")
        else:
            quality = value.get("quality")
            if not isinstance(quality, dict) or not quality:
                raise ValidationError("A quality report requires measured figures.")
            bounds = {
                "rttMs": 60000,
                "jitterMs": 60000,
                "packetsLost": 2147483647,
                "packetsReceived": 2147483647,
                "reconnects": 1000,
            }
            for name, figure in quality.items():
                if name in bounds:
                    valid = (
                        isinstance(figure, int)
                        and not isinstance(figure, bool)
                        and 0 <= figure <= bounds[name]
                    )
                elif name in ("audioCodec", "videoCodec"):
                    valid = isinstance(figure, str) and bool(
                        re.fullmatch(r"[A-Za-z0-9/.-]{1,32}", figure)
                    )
                elif name == "candidateType":
                    valid = figure in ("host", "srflx", "prflx", "relay")
                else:
                    valid = False
                if not valid:
                    raise ValidationError("Invalid call quality figure.")
        participant = value.get("participant")
        if participant is not None and not isinstance(participant, str):
            raise ValidationError("Invalid participant.")
        self._participant(participant)
        return await self._request(
            "POST", f"/messaging/voip/calls/{segment(call_id)}/reports", body=body, options=options
        )

    @staticmethod
    def _connection(value: object) -> None:
        if not isinstance(value, str) or not re.fullmatch(r"[A-Za-z0-9_-]{8,64}", value):
            raise ValidationError("Invalid connectionId.")

    @staticmethod
    def _report_client(value: object) -> None:
        if not isinstance(value, dict) or set(value) - {"sdk", "version", "platform"}:
            raise ValidationError("Invalid call report client.")
        sdk, version = value.get("sdk"), value.get("version")
        if not isinstance(sdk, str) or not re.fullmatch(r"[a-z0-9@/._-]{1,32}", sdk):
            raise ValidationError("Invalid call report SDK.")
        if (
            not isinstance(version, str)
            or len(version) > 32
            or not re.fullmatch(
                r"[0-9]{1,6}\.[0-9]{1,6}\.[0-9]{1,6}(?:[-+][0-9A-Za-z.+-]{1,24})?", version
            )
        ):
            raise ValidationError("Invalid call report version.")
        if value.get("platform") not in ("browser", "node", "other"):
            raise ValidationError("Invalid call report platform.")
