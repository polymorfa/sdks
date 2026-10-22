"""Literal event guards narrow verified envelopes to their public payload type."""

from typing import Literal, TypeGuard

from typing_extensions import overload

from . import webhook_models as m
from .webhook_models import TypedWebhookEvent


@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["bansafe.action"]
) -> TypeGuard[TypedWebhookEvent[Literal["bansafe.action"], m.BanSafeActionPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["bansafe.claim"]
) -> TypeGuard[TypedWebhookEvent[Literal["bansafe.claim"], m.BanSafeClaimPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["bansafe.health_threshold"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["bansafe.health_threshold"], m.BanSafeHealthThresholdPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["bansafe.incident"]
) -> TypeGuard[TypedWebhookEvent[Literal["bansafe.incident"], m.BanSafeIncidentPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["blocklist.update"]
) -> TypeGuard[TypedWebhookEvent[Literal["blocklist.update"], m.BlocklistUpdatePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["business.quick_reply.update"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["business.quick_reply.update"], m.BusinessQuickReplyUpdatePayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.accepted"]
) -> TypeGuard[TypedWebhookEvent[Literal["call.accepted"], m.CallAcceptedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.connection_joined"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["call.connection_joined"], m.CallConnectionJoinedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.connection_left"]
) -> TypeGuard[TypedWebhookEvent[Literal["call.connection_left"], m.CallConnectionLeftPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.ended"]
) -> TypeGuard[TypedWebhookEvent[Literal["call.ended"], m.CallEndedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.missed"]
) -> TypeGuard[TypedWebhookEvent[Literal["call.missed"], m.CallMissedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object],
    event_type: Literal["call.participant_joined", "call.participant_state"],
) -> TypeGuard[
    TypedWebhookEvent[
        Literal["call.participant_joined", "call.participant_state"], m.CallParticipantPayload
    ]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.participant_left"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["call.participant_left"], m.CallParticipantLeftPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.permission_changed"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["call.permission_changed"], m.CallPermissionChangedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["order.payment_updated"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["order.payment_updated"], m.OrderPaymentUpdatedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.received"]
) -> TypeGuard[TypedWebhookEvent[Literal["call.received"], m.CallReceivedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.rejected"]
) -> TypeGuard[TypedWebhookEvent[Literal["call.rejected"], m.CallRejectedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["call.telemetry"]
) -> TypeGuard[TypedWebhookEvent[Literal["call.telemetry"], m.CallTelemetryPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.cap_reached"]
) -> TypeGuard[TypedWebhookEvent[Literal["campaign.cap_reached"], m.CampaignCapReachedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.cold_blocked"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["campaign.cold_blocked"], m.CampaignColdBlockedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.completed"]
) -> TypeGuard[TypedWebhookEvent[Literal["campaign.completed"], m.CampaignCompletedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.failed"]
) -> TypeGuard[TypedWebhookEvent[Literal["campaign.failed"], m.CampaignFailedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.launched"]
) -> TypeGuard[TypedWebhookEvent[Literal["campaign.launched"], m.CampaignLaunchedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.paused"]
) -> TypeGuard[TypedWebhookEvent[Literal["campaign.paused"], m.CampaignPausedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.recipient_failed"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["campaign.recipient_failed"], m.CampaignRecipientFailedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.recipient_sent"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["campaign.recipient_sent"], m.CampaignRecipientSentPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.recipient_skipped"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["campaign.recipient_skipped"], m.CampaignRecipientSkippedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.rescheduled"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["campaign.rescheduled"], m.CampaignRescheduledPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.resumed"]
) -> TypeGuard[TypedWebhookEvent[Literal["campaign.resumed"], m.CampaignResumedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.stopped"]
) -> TypeGuard[TypedWebhookEvent[Literal["campaign.stopped"], m.CampaignStoppedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["campaign.throttled"]
) -> TypeGuard[TypedWebhookEvent[Literal["campaign.throttled"], m.CampaignThrottledPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["chat.archive"]
) -> TypeGuard[TypedWebhookEvent[Literal["chat.archive"], m.ChatArchivePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["chat.clear", "chat.delete"]
) -> TypeGuard[TypedWebhookEvent[Literal["chat.clear", "chat.delete"], m.ChatClearPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["chat.mute"]
) -> TypeGuard[TypedWebhookEvent[Literal["chat.mute"], m.ChatMutePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["chat.read"]
) -> TypeGuard[TypedWebhookEvent[Literal["chat.read"], m.ChatReadPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["command.result"]
) -> TypeGuard[TypedWebhookEvent[Literal["command.result"], m.CommandResultPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object],
    event_type: Literal["contact.opted_in", "contact.opted_out"],
) -> TypeGuard[
    TypedWebhookEvent[Literal["contact.opted_in", "contact.opted_out"], m.ContactOptPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["contact.sync"]
) -> TypeGuard[TypedWebhookEvent[Literal["contact.sync"], m.ContactsSyncPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["contact.update"]
) -> TypeGuard[TypedWebhookEvent[Literal["contact.update"], m.ContactUpdatePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object],
    event_type: Literal["customer.archived", "customer.created", "customer.restored"],
) -> TypeGuard[
    TypedWebhookEvent[
        Literal["customer.archived", "customer.created", "customer.restored"],
        m.CustomerEventPayload,
    ]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.archiving"]
) -> TypeGuard[TypedWebhookEvent[Literal["customer.archiving"], m.CustomerArchivingPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.enabled"]
) -> TypeGuard[TypedWebhookEvent[Literal["customer.enabled"], m.CustomerEnabledPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.number.attached"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["customer.number.attached"], m.CustomerNumberAttachedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.number.disconnected"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["customer.number.disconnected"], m.CustomerNumberDisconnectedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.number.transferred"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["customer.number.transferred"], m.CustomerNumberTransferredPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.pairing_link.connected"]
) -> TypeGuard[
    TypedWebhookEvent[
        Literal["customer.pairing_link.connected"], m.CustomerPairingLinkConnectedPayload
    ]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object],
    event_type: Literal[
        "customer.pairing_link.created",
        "customer.pairing_link.expired",
        "customer.pairing_link.opened",
    ],
) -> TypeGuard[
    TypedWebhookEvent[
        Literal[
            "customer.pairing_link.created",
            "customer.pairing_link.expired",
            "customer.pairing_link.opened",
        ],
        m.CustomerPairingLinkPayload,
    ]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.pairing_link.failed"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["customer.pairing_link.failed"], m.CustomerPairingLinkFailedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.pairing_link.revoked"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["customer.pairing_link.revoked"], m.CustomerPairingLinkRevokedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["customer.updated"]
) -> TypeGuard[TypedWebhookEvent[Literal["customer.updated"], m.CustomerUpdatedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["group.participant"]
) -> TypeGuard[TypedWebhookEvent[Literal["group.participant"], m.GroupParticipantPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["group.update"]
) -> TypeGuard[TypedWebhookEvent[Literal["group.update"], m.GroupUpdatePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["history.sync"]
) -> TypeGuard[TypedWebhookEvent[Literal["history.sync"], m.HistorySyncPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["labels.update"]
) -> TypeGuard[TypedWebhookEvent[Literal["labels.update"], m.LabelsUpdatePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["message.ack"]
) -> TypeGuard[TypedWebhookEvent[Literal["message.ack"], m.MessageAckPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["message.delete"]
) -> TypeGuard[TypedWebhookEvent[Literal["message.delete"], m.MessageDeletePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["message.echo"]
) -> TypeGuard[TypedWebhookEvent[Literal["message.echo"], m.MessageEchoPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object],
    event_type: Literal["message.edited", "message.revoked", "message.update"],
) -> TypeGuard[
    TypedWebhookEvent[
        Literal["message.edited", "message.revoked", "message.update"], m.LinkedDeviceMessagePayload
    ]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["message.failed"]
) -> TypeGuard[TypedWebhookEvent[Literal["message.failed"], m.MessageFailedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object],
    event_type: Literal["message.reaction", "message.received"],
) -> TypeGuard[
    TypedWebhookEvent[Literal["message.reaction", "message.received"], m.MessageReceivedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["message.sent"]
) -> TypeGuard[TypedWebhookEvent[Literal["message.sent"], m.MessageSentPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["message.vote"]
) -> TypeGuard[TypedWebhookEvent[Literal["message.vote"], m.PollVotePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["newsletter.update"]
) -> TypeGuard[TypedWebhookEvent[Literal["newsletter.update"], m.NewsletterUpdatePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["presence.update"]
) -> TypeGuard[TypedWebhookEvent[Literal["presence.update"], m.PresenceUpdatePayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["session.capabilities_updated"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["session.capabilities_updated"], m.SessionCapabilitiesUpdatedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["session.connected"]
) -> TypeGuard[TypedWebhookEvent[Literal["session.connected"], m.SessionConnectedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["session.logged_out"]
) -> TypeGuard[TypedWebhookEvent[Literal["session.logged_out"], m.SessionLoggedOutPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["session.phone_offline"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["session.phone_offline"], m.SessionPhoneOfflinePayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["session.restriction_updated"]
) -> TypeGuard[
    TypedWebhookEvent[Literal["session.restriction_updated"], m.SessionRestrictionUpdatedPayload]
]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["session.status"]
) -> TypeGuard[TypedWebhookEvent[Literal["session.status"], m.SessionStatusPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["template.status"]
) -> TypeGuard[TypedWebhookEvent[Literal["template.status"], m.TemplateStatusPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["usage.recorded"]
) -> TypeGuard[TypedWebhookEvent[Literal["usage.recorded"], m.UsageRecordedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["voice.asset_failed"]
) -> TypeGuard[TypedWebhookEvent[Literal["voice.asset_failed"], m.VoiceAssetFailedPayload]]: ...
@overload
def is_event(
    event: TypedWebhookEvent[str, object], event_type: Literal["voice.asset_ready"]
) -> TypeGuard[TypedWebhookEvent[Literal["voice.asset_ready"], m.VoiceAssetReadyPayload]]: ...
@overload
def is_event(event: TypedWebhookEvent[str, object], event_type: str) -> bool: ...


def is_event(event: TypedWebhookEvent[str, object], event_type: str) -> bool:
    return event.event == event_type
