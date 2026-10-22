import re
from pathlib import Path
from typing import get_args, get_type_hints

import pytest
from typing_extensions import NotRequired, get_overloads

from polymorfa import construct_webhook_event, create_webhook_fixture, is_event
from polymorfa import webhook_models as m
from polymorfa.webhooks import KNOWN_EVENT_TYPES

NOW = "2026-10-11T00:00:00Z"
IDENTITY = {
    "id": "15551234567",
    "phoneNumber": "+15551234567",
    "bsuid": "business_1",
    "username": "example",
}
IDS = {"linked_devices": "WA_1", "official_api": "wamid.fixture"}
MESSAGE = {
    "id": "message_1",
    "whatsapp_ids": IDS,
    "whatsapp_id": "WA_1",
    "conversation": {**IDENTITY, "sender": IDENTITY},
    "fromMe": False,
    "timestamp": 1234.5,
    "pushName": "Example",
    "isGroup": False,
    "type": "image",
    "text": "hello",
    "caption": "caption",
    "mimeType": "image/jpeg",
    "ptt": False,
    "filename": "picture.jpg",
    "latitude": 1.5,
    "longitude": 2.5,
    "displayName": "Name",
    "title": "Title",
    "reaction": "👍",
    "reactionTo": "message_0",
    "revokedId": "message_0",
    "media": "descriptor",
    "mediaUrl": "https://storage.example.invalid/media",
    "edited": True,
    "pollOptions": [{"name": "Yes", "hash": "hash"}],
    "unavailable": False,
    "unavailableReason": "",
    "nativeFlowResponse": {"name": "flow", "paramsJson": "{}", "version": 3},
    "replyChoice": {"kind": "button", "id": "choice_1"},
    "parentMessageId": "message_0",
}
CUSTOMER = {
    "eventId": "event_1",
    "occurredAt": NOW,
    "organizationId": "org_1",
    "projectId": "project_1",
    "customerId": "customer_1",
    "actorKind": "project_token",
}
PAIRING = {**CUSTOMER, "pairingLinkId": "pairing_1"}
PARTICIPANT = {
    **IDENTITY,
    "audioMuted": False,
    "video": False,
    "handRaised": True,
    "state": "connected",
}
VOICE = {
    "eventId": "event_1",
    "occurredAt": NOW,
    "organizationId": "org_1",
    "projectId": "project_1",
    "assetId": "asset_1",
    "name": "Greeting",
    "source": "tts",
}
CASES = [
    (
        ("bansafe.action",),
        {
            "phoneNumber": "+1555",
            "action": "applied",
            "scope": "number",
            "rung": "throttle",
            "previousRung": "notify",
            "reason": "health",
            "health": 40.5,
            "healthBand": "poor",
            "requires": [{"findingKey": "finding_1", "title": "Review", "severity": "warning"}],
            "throughputPerMinute": 1.5,
            "eligibleLiftAt": NOW,
            "liftRequires": "review",
            "appealUrl": "https://example.invalid/appeal",
            "startedAt": NOW,
            "docs": "https://example.invalid/docs",
        },
    ),
    (
        ("bansafe.claim",),
        {
            "id": "claim_1",
            "incidentId": "incident_1",
            "phoneNumber": "+1555",
            "status": "paid",
            "verdict": "ours",
            "windowStart": NOW,
            "windowEnd": NOW,
            "measuredCents": 1.123456,
            "capCents": 2.123456,
            "amountCents": 1.123456,
            "summary": "Summary",
            "reason": "Reason",
            "decidedAt": NOW,
            "paidAt": NOW,
        },
    ),
    (
        ("bansafe.health_threshold",),
        {
            "sessionId": "session_1",
            "projectId": "project_1",
            "health": 40.5,
            "threshold": 50,
            "healthSource": "rules_v1",
            "estimatorVersion": "v1",
            "modelVersion": None,
            "evaluatedAt": NOW,
            "policyVersion": 1,
            "episodeId": "episode_1",
            "actionId": "action_1",
        },
    ),
    (
        ("bansafe.incident",),
        {
            "id": "incident_1",
            "phoneNumber": "+1555",
            "kind": "cap_warning",
            "source": "runtime",
            "startedAt": NOW,
            "endsAt": None,
            "belief": 0.75,
            "resolution": "open",
            "claimId": None,
            "closedAt": None,
        },
    ),
    (("blocklist.update",), {"action": "change", "changes": [{**IDENTITY, "action": "add"}]}),
    (
        ("business.quick_reply.update",),
        {
            "id": "reply_1",
            "shortcut": "hello",
            "message": "Hello",
            "keywords": ["hello"],
            "count": 2,
            "deleted": False,
            "associatedLabelIds": ["label_1"],
            "observedAt": 1234,
            "fromFullSync": True,
        },
    ),
    (
        ("call.accepted",),
        {
            "from": IDENTITY,
            "callId": "call_1",
            "answeredBy": "server:default",
            "exclusive": True,
            "sessionConnection": "linked_device",
            "capabilities": {"video": True, "invite": False},
        },
    ),
    (
        ("call.connection_joined",),
        {
            "callId": "call_1",
            "connection": {
                "id": "connection_1",
                "participant": "server:default",
                "transport": "sip",
            },
        },
    ),
    (
        ("call.connection_left",),
        {
            "callId": "call_1",
            "connectionId": "connection_1",
            "participant": "server:default",
            "reason": "sip_busy",
        },
    ),
    (
        ("call.ended",),
        {
            "from": None,
            "callId": "call_1",
            "durationSeconds": 1.5,
            "reason": "pod_lost",
            "direction": "inbound",
            "hadVideo": True,
            "sessionConnection": "cloud_api",
        },
    ),
    (("call.missed",), {"from": IDENTITY, "callId": "call_1", "reason": "timeout"}),
    (
        ("call.participant_joined", "call.participant_state"),
        {"callId": "call_1", "participant": PARTICIPANT},
    ),
    (
        ("call.participant_left",),
        {"callId": "call_1", "participantId": "participant_1", "reason": "left"},
    ),
    (
        ("call.permission_changed",),
        {
            "conversation": IDENTITY,
            "status": "permanent",
            "previousStatus": "temporary",
            "expiresAt": None,
            "source": "user_action",
            "changedAt": NOW,
        },
    ),
    (
        ("order.payment_updated",),
        {
            "reportedBy": "whatsapp",
            "providerEventId": "WA_1",
            "referenceId": "order_1",
            "conversation": {"phoneNumber": "+1555"},
            "kind": "payment_status",
            "status": "captured",
            "amount": {"value": 101, "offset": 100},
            "currency": "BRL",
            "transaction": {
                "id": "transaction_1",
                "providerTransactionId": "provider_1",
                "provider": "pix",
                "status": "captured",
                "method": "pix",
                "errorCode": "",
            },
        },
    ),
    (
        ("call.received",),
        {
            "from": IDENTITY,
            "callId": "call_1",
            "hasVideo": True,
            "sessionConnection": "cloud_api",
            "capabilities": {"video": True, "invite": False},
        },
    ),
    (("call.rejected",), {"from": IDENTITY, "callId": "call_1"}),
    (
        ("call.telemetry",),
        {
            "callId": "call_1",
            "setupMs": 1.5,
            "ringMs": 2.5,
            "durationSeconds": 3.5,
            "terminateReason": "ended",
            "codec": "opus",
            "jitterMs": 4.5,
            "packetsLost": 1,
            "rttMs": 5.5,
            "recvKbps": 10.5,
            "sendKbps": 20.5,
        },
    ),
    (
        ("campaign.cap_reached",),
        {
            "campaignId": "campaign_1",
            "sessionKey": "support",
            "phone": "+1555",
            "capType": "daily",
            "capLimit": 1,
            "windowResetsAt": 1234,
            "at": 1234,
        },
    ),
    (
        ("campaign.cold_blocked",),
        {
            "campaignId": "campaign_1",
            "recipientId": "recipient_1",
            "phone": "+1555",
            "surface": "message",
            "reason": "blocked",
            "at": 1234,
        },
    ),
    (
        ("campaign.completed",),
        {
            "campaignId": "campaign_1",
            "sentCount": 1,
            "deliveredCount": 1,
            "readCount": 1,
            "failedCount": 0,
            "skippedCount": 0,
            "responseCount": 1,
            "completedAt": 1234,
            "durationMs": 10.5,
        },
    ),
    (("campaign.failed",), {"campaignId": "campaign_1", "reason": "failed", "failedAt": 1234}),
    (
        ("campaign.launched",),
        {
            "campaignId": "campaign_1",
            "name": "Example",
            "recipientCount": 1,
            "scheduled": True,
            "launchedAt": 1234,
        },
    ),
    (
        ("campaign.paused",),
        {"campaignId": "campaign_1", "sentCount": 1, "remainingCount": 1, "pausedAt": 1234},
    ),
    (
        ("campaign.recipient_failed",),
        {
            "campaignId": "campaign_1",
            "recipientId": "recipient_1",
            "phone": "+1555",
            "attempts": 1,
            "error": "failed",
            "failedAt": 1234,
        },
    ),
    (
        ("campaign.recipient_sent",),
        {
            "campaignId": "campaign_1",
            "recipientId": "recipient_1",
            "phone": "+1555",
            "sessionKey": "support",
            "externalMessageId": "message_1",
            "variantKey": "a",
            "attempt": 1,
        },
    ),
    (
        ("campaign.recipient_skipped",),
        {
            "campaignId": "campaign_1",
            "recipientId": "recipient_1",
            "phone": "+1555",
            "reason": "skipped",
            "skippedAt": 1234,
        },
    ),
    (
        ("campaign.rescheduled",),
        {
            "campaignId": "campaign_1",
            "previousScheduledAt": None,
            "scheduledAt": 1234,
            "rescheduledAt": 1234,
        },
    ),
    (
        ("campaign.resumed",),
        {"campaignId": "campaign_1", "sentCount": 1, "remainingCount": 1, "resumedAt": 1234},
    ),
    (
        ("campaign.stopped",),
        {"campaignId": "campaign_1", "sentCount": 1, "abandonedCount": 1, "stoppedAt": 1234},
    ),
    (
        ("campaign.throttled",),
        {
            "campaignId": "campaign_1",
            "sessionKey": "support",
            "reason": "throttled",
            "deferredCount": 1,
            "at": 1234,
        },
    ),
    (("chat.archive",), {"from": IDENTITY, "archive": True, "pinned": False}),
    (("chat.clear", "chat.delete"), {"from": IDENTITY}),
    (("chat.mute",), {"from": IDENTITY, "muted": True, "muteEndTimestamp": 1234}),
    (("chat.read",), {"from": IDENTITY, "read": True}),
    (
        ("command.result",),
        {
            "requestId": "request_1",
            "command": "send",
            "success": True,
            "data": {"future": True},
            "error": "",
        },
    ),
    (
        ("contact.opted_in", "contact.opted_out"),
        {
            "phone": "+1555",
            "source": "stop-keyword",
            "keyword": "STOP",
            "session": "support",
            "projectId": "project_1",
        },
    ),
    (("contact.sync",), {"kind": "contacts", "value": {"future": True}}),
    (
        ("contact.update",),
        {
            **IDENTITY,
            "fullName": "Example",
            "firstName": "Example",
            "pushName": "Example",
            "oldPushName": "Old",
            "businessName": "Business",
            "oldBusinessName": "Old business",
            "pictureId": "picture_1",
            "pictureRemoved": False,
        },
    ),
    (("customer.archived", "customer.created", "customer.restored"), CUSTOMER),
    (("customer.archiving",), {**CUSTOMER, "blockingNumberCount": 1, "revokedPairingLinkCount": 2}),
    (("customer.enabled",), {**CUSTOMER, "migratedNumberCount": 1}),
    (
        ("customer.number.attached",),
        {**CUSTOMER, "sessionId": "session_1", "pairingLinkId": "pairing_1"},
    ),
    (
        ("customer.number.disconnected",),
        {**CUSTOMER, "sessionId": "session_1", "reason": "disconnected"},
    ),
    (
        ("customer.number.transferred",),
        {**CUSTOMER, "sessionId": "session_1", "sourceCustomerId": "customer_0"},
    ),
    (("customer.pairing_link.connected",), {**PAIRING, "sessionId": "session_1"}),
    (
        (
            "customer.pairing_link.created",
            "customer.pairing_link.expired",
            "customer.pairing_link.opened",
        ),
        PAIRING,
    ),
    (("customer.pairing_link.failed",), {**PAIRING, "errorCode": "failed"}),
    (("customer.pairing_link.revoked",), {**PAIRING, "reason": "customer_archived"}),
    (("customer.updated",), {**CUSTOMER, "fields": ["name", "phone", "externalCustomerId"]}),
    (
        ("group.participant",),
        {
            "id": "group_1",
            "joined": [IDENTITY],
            "left": [IDENTITY],
            "promoted": [IDENTITY],
            "demoted": [IDENTITY],
            "reason": "invite_link",
            "initiatedBy": "business",
            "requestId": "request_1",
            "failedParticipants": [
                {"participant": IDENTITY, "errors": [{"code": 1, "title": "failed"}]}
            ],
            "errors": [{"code": 1, "title": "failed"}],
            "joinRequest": {"joinRequestId": "join_1", "user": IDENTITY, "state": "created"},
        },
    ),
    (
        ("group.update",),
        {
            "id": "group_1",
            "newSubject": "Subject",
            "newDescription": "Description",
            "action": "settings_updated",
            "requestId": "request_1",
            "inviteLink": "https://example.invalid/invite",
            "joinApprovalRequired": True,
            "pictureChanged": True,
            "failedChanges": ["picture"],
            "errors": [{"code": 1, "title": "failed"}],
        },
    ),
    (
        ("history.sync",),
        {
            "whatsapp_ids": IDS,
            "whatsapp_id": "WA_1",
            "original_whatsapp_ids": IDS,
            "original_whatsapp_id": "WA_0",
            "messages": [
                {
                    "id": "message_1",
                    "whatsapp_ids": IDS,
                    "whatsapp_id": "WA_1",
                    "conversation": IDENTITY,
                    "fromMe": False,
                }
            ],
            "mode": "deliver",
            "syncType": "recent",
            "chunkOrder": 1,
            "progress": 100,
            "fileLength": 10,
            "conversationCount": 1,
            "messageCount": 1,
            "pushNameCount": 1,
            "statusMessageCount": 1,
            "whatsapp": {"encoding": "gzip-base64-protobuf", "data": "fixture"},
        },
    ),
    (
        ("labels.update",),
        {
            "action": "label_edit",
            "labelId": "label_1",
            "from": IDENTITY,
            "label": "Label",
            "name": "Label",
            "color": 1,
            "orderIndex": 1,
            "deleted": False,
            "labeled": True,
            "observedAt": 1234,
            "messageId": "message_1",
            "starred": True,
        },
    ),
    (
        ("message.ack",),
        {
            "messages": [{"id": "message_1", "whatsapp_ids": IDS, "whatsapp_id": "WA_1"}],
            "conversation": IDENTITY,
            "from": IDENTITY,
            "sender": IDENTITY,
            "type": "read",
            "timestamp": 1234,
            "pricing": {
                "billable": True,
                "pricing_model": "PMP",
                "category": "marketing",
                "type": "regular",
            },
        },
    ),
    (
        ("message.delete",),
        {
            "from": IDENTITY,
            "sender": IDENTITY,
            "id": "message_1",
            "whatsapp_ids": IDS,
            "whatsapp_id": "WA_1",
            "conversation": IDENTITY,
            "fromMe": True,
        },
    ),
    (("message.echo",), {"source": "whatsapp_business_app", "value": {"future": True}}),
    (
        (
            "message.edited",
            "message.revoked",
            "message.update",
            "message.reaction",
            "message.received",
        ),
        MESSAGE,
    ),
    (
        ("message.failed",),
        {
            "to": IDENTITY,
            "type": "image",
            "error": "ack_timeout",
            "code": "future_code",
            "retryAfter": 1.5,
            "timestamp": 1234,
        },
    ),
    (
        ("message.sent",),
        {
            "id": "message_1",
            "whatsapp_ids": IDS,
            "whatsapp_id": "WA_1",
            "conversation": IDENTITY,
            "type": "image",
            "timestamp": 1234,
        },
    ),
    (
        ("message.vote",),
        {
            "conversation": IDENTITY,
            "pollMessageId": "message_1",
            "voter": IDENTITY,
            "selectedHashes": ["hash"],
            "timestamp": 1234,
        },
    ),
    (("newsletter.update",), {"id": "channel_1", "action": "mute", "muted": True}),
    (
        ("presence.update",),
        {
            "observedAt": 1234,
            "from": IDENTITY,
            "sender": IDENTITY,
            "state": "typing",
            "media": "audio",
            "unavailable": False,
            "lastSeen": 1234,
        },
    ),
    (
        ("session.capabilities_updated",),
        {
            "session": "support",
            "projectId": "project_1",
            "status": "synced",
            "syncedAt": NOW,
            "checkedAt": NOW,
            "accountType": "business",
            "capabilities": [
                {
                    "kind": "feature",
                    "key": "calls",
                    "supported": True,
                    "source": "runtime",
                    "reason": None,
                }
            ],
            "changedKeys": ["calls"],
        },
    ),
    (
        ("session.connected",),
        {
            "phoneNumber": "+1555",
            "id": "1555",
            "pushName": "Example",
            "phonePlatform": "android",
            "accountType": "business_app",
            "businessName": "Business",
        },
    ),
    (("session.logged_out",), {"reason": "device_removed", "code": 401}),
    (
        ("session.phone_offline",),
        {"daysSinceLastSeen": 10, "daysRemaining": 4, "lastSeen": NOW, "action": "reconnect"},
    ),
    (
        ("session.restriction_updated",),
        {
            "type": "reachout_timelock",
            "active": True,
            "enforcementType": "timelock",
            "expiresAt": NOW,
            "observedAt": NOW,
        },
    ),
    (
        ("session.status",),
        {
            "status": "connected",
            "statusReason": "ready",
            "banCode": 0,
            "banReason": "",
            "banExpiresAt": 1234,
            "detail": "ready",
        },
    ),
    (
        ("template.status",),
        {
            "templateName": "hello",
            "templateId": "template_1",
            "status": "APPROVED",
            "category": "MARKETING",
            "reason": "",
            "qualityRating": "GREEN",
        },
    ),
    (
        ("usage.recorded",),
        {
            "id": "usage_1",
            "meter": "call.duration",
            "quantity": 1.123456,
            "unit": "second",
            "dimensions": {"video": False, "duration": 1.5, "direction": "inbound"},
            "keySource": "none",
            "sourceKind": "call",
            "sourceId": "call_1",
            "projectId": None,
            "session": None,
            "occurredAt": NOW,
            "recordedAt": NOW,
            "revision": 2,
            "pricingState": "unpriced",
            "rateCard": {"id": "rate_1", "version": 1},
            "pricedCredits": None,
        },
    ),
    (("voice.asset_failed",), {**VOICE, "failureReason": "future_failure"}),
    (
        ("voice.asset_ready",),
        {**VOICE, "durationMs": 1.5, "contentSha256": "a" * 64, "originalFormat": "ogg"},
    ),
]
CASES += [
    (
        ("marketing.onboarding_updated",),
        {"kind": "terms_signed", "wabaId": "w", "metaEvent": "MM_LITE_TERMS_SIGNED"},
    ),
    (
        ("contact.marketing_preference_updated",),
        {"waId": "opaque", "preference": "stop", "category": "marketing_messages"},
    ),
]

EXPANDED = [(event_type, payload) for types, payload in CASES for event_type in types]


@pytest.mark.parametrize("event_type,payload", EXPANDED, ids=[case[0] for case in EXPANDED])
def test_known_payload_raw_signature_roundtrip_extra_fields_and_typed_guard(event_type, payload):
    envelope = {
        "id": "event_1",
        "session": "",
        "externalId": "external_1",
        "timestamp": NOW,
        "event": event_type,
        "payload": {**payload, "future": {"kept": True}},
        "futureEnvelope": True,
    }
    fixture = create_webhook_fixture(envelope, "secret")
    event = construct_webhook_event(fixture.body, fixture.signature, "secret")
    assert event.known and is_event(event, event_type) and not is_event(event, "future.event")
    assert (
        event.payload == envelope["payload"]
        and event.raw == envelope
        and event.external_id == "external_1"
    )


def test_every_known_guard_maps_exact_pinned_model_and_handwritten_fixture_contains_required_fields():
    source = (
        Path(__file__).resolve().parents[3] / "packages/typescript/src/webhooks/events.ts"
    ).read_text()
    block = source.split("export interface WebhookPayloadMap {", 1)[1].split("\n}", 1)[0]
    expected = dict(re.findall(r'"([^"]+)": ([A-Za-z]+);', block))
    mapped = {}
    for guard in get_overloads(is_event):
        hints = get_type_hints(guard)
        literal = hints["event_type"]
        if literal is str:
            continue
        payload = get_args(get_args(hints["return"])[0])[1]
        for event_type in get_args(literal):
            mapped[event_type] = payload
    assert set(expected) == set(mapped) == KNOWN_EVENT_TYPES == {case[0] for case in EXPANDED}
    for event_type, name in expected.items():
        assert mapped[event_type] == getattr(m, name)
    for event_type, payload in EXPANDED:
        model = mapped[event_type]
        variants = get_args(model) or (model,)
        assert any(
            {
                key
                for key, annotation in get_type_hints(variant, include_extras=True).items()
                if getattr(annotation, "__origin__", None) is not NotRequired
            }
            <= payload.keys()
            for variant in variants
        )


def test_union_variants_unknown_event_and_known_bad_payload_are_preserved_without_schema_rewrite():
    for event_type, payload in [
        (
            "message.received",
            {
                "id": "message_1",
                "whatsapp_ids": {"official_api": "wamid.fixture"},
                "conversation": IDENTITY,
                "timestamp": NOW,
                "type": "interactive",
                "senderName": "Example",
                "nativeFlowResponse": {"name": "flow", "paramsJson": "{}"},
                "replyChoice": {"kind": "list", "id": "choice_1"},
                "parentMessageId": "message_0",
                "interactive": {"future": True},
                "referral": {
                    "source_type": "ad",
                    "source_id": "source_1",
                    "source_url": "https://example.invalid/ad",
                    "ctwa_clid": "click_1",
                },
            },
        ),
        (
            "session.status",
            {
                "source": "meta",
                "kind": "account_update",
                "wabaId": "waba_1",
                "value": {"future": True},
            },
        ),
        ("history.sync", {"kind": "history", "value": {"future": True}}),
        (
            "template.status",
            {
                "kind": "message_template_quality_update",
                "event": "quality",
                "templateId": "template_1",
                "templateName": "hello",
                "language": "en",
                "reason": "changed",
                "previousQualityScore": "GREEN",
                "newQualityScore": "YELLOW",
                "wabaId": "waba_1",
            },
        ),
        (
            "order.payment_updated",
            {
                "reportedBy": "whatsapp",
                "providerEventId": "WA_1",
                "referenceId": "order_1",
                "conversation": {"id": "1555"},
                "kind": "payment_method_selected",
                "messageId": "message_1",
                "paymentMethod": "pix",
                "lastFourDigits": "1234",
                "credentialId": "credential_1",
                "paymentTimestamp": 1234,
            },
        ),
        ("future.event", ["future", True, None]),
        ("message.received", None),
    ]:
        envelope = {
            "id": "event_1",
            "session": "",
            "timestamp": NOW,
            "event": event_type,
            "payload": payload,
        }
        fixture = create_webhook_fixture(envelope, "secret")
        event = construct_webhook_event(fixture.body, fixture.signature, "secret")
        assert event.payload == payload and event.known == (event_type in KNOWN_EVENT_TYPES)
