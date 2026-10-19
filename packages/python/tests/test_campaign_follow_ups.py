"""Pinned follow-up contracts and native HTTP serialization on both audiences."""

import json
from pathlib import Path
from typing import get_args, get_type_hints

import pytest
from aiohttp import web

from polymorfa import AsyncClient, AsyncMessagingClient, AuthorizationError, Credential
from polymorfa import campaign_models as C

CONTRACT = json.loads(
    (Path(__file__).resolve().parents[3] / "contracts/campaign-follow-ups.json").read_text()
)
STATUSES = [
    "waiting_receipt",
    "scheduled",
    "sending",
    "sent",
    "cancelled",
    "expired",
    "failed",
    "outcome_unknown",
]
SUMMARY = {
    "id": "follow_up_1",
    "numberId": "number_1",
    "status": "scheduled",
    "anchorKind": "read",
    "firstDeliveredAt": 1728000010000,
    "firstReadAt": 1728000020000,
    "dueAt": 1728000080000,
    "expiresAt": 1728086410000,
    "sentAt": None,
    "deliveredAt": None,
    "readAt": None,
    "repliedAt": None,
    "reason": None,
    "commandId": None,
}
REPORT = {
    "total": 5,
    "waiting": 1,
    "scheduled": 1,
    "sending": 0,
    "sent": 1,
    "delivered": 1,
    "read": 1,
    "replied": 1,
    "cancelled": 1,
    "expired": 1,
    "failed": 0,
    "unknown": 0,
    "nextDueAt": 1728000080000,
}


def test_follow_up_types_match_pinned_audience_contracts():
    messaging, platform = (CONTRACT["sources"][key] for key in ("messaging", "platform"))
    assert len(CONTRACT["commit"]) == 40
    schema = platform["schemas"]["CampaignFollowUp"]
    assert set(get_type_hints(C.FollowUp)) == set(schema["properties"])
    assert C.FollowUp.__required_keys__ == set(schema["required"]) == {"message"}
    assert C.FollowUp.__optional_keys__ == {"delaySeconds", "expirySeconds"}
    messages = schema["properties"]["message"]["oneOf"]
    for model, source in zip((C.TextFollowUpMessage, C.TemplateFollowUpMessage), messages):
        assert set(get_type_hints(model)) == set(source["properties"])
        assert model.__required_keys__ == set(source["required"])
        assert list(get_args(get_type_hints(model)["type"])) == source["properties"]["type"]["enum"]
    for model, name in (
        (C.FollowUpSummary, "CampaignFollowUpSummary"),
        (C.FollowUpReport, "CampaignFollowUpReport"),
    ):
        source = platform["schemas"][name]
        assert set(get_type_hints(model)) == set(source["properties"])
        assert model.__required_keys__ == set(source["required"])
    assert list(get_args(C.FollowUpStatus)) == STATUSES
    assert (
        platform["schemas"]["CampaignFollowUpSummary"]["properties"]["status"]["enum"] == STATUSES
    )
    assert "followUp" in C.Campaign.__required_keys__
    assert "followUp" in C.Recipient.__required_keys__
    assert "followUps" in C.Analytics.__required_keys__
    assert "followUps" in C.PlatformAnalytics.__required_keys__
    assert messaging["fields"]["Campaign.followUp"]["required"] == ["message"]
    for model in (C.CreateCampaign, C.CreatePlatformCampaign, C.UpdateCampaign):
        assert "followUp" in model.__optional_keys__


@pytest.mark.parametrize("surface", ["messaging", "platform"])
@pytest.mark.parametrize(
    "configuration",
    [
        {"message": {"type": "text", "text": "Still interested, {{name}}?"}},
        {"message": {"type": "template", "templateId": "22222222-2222-4222-8222-222222222222"}},
        {
            "delaySeconds": 60,
            "expirySeconds": 86400,
            "message": {"type": "text", "text": "Checking in"},
        },
    ],
)
async def test_native_follow_up_requests_responses_and_removal(surface, configuration):
    """The real HTTPX socket adapter must preserve omitted defaults and explicit null."""
    seen = []
    prefix = (
        "/messaging/projects/support/campaigns" if surface == "messaging" else "/platform/campaigns"
    )

    async def handler(request):
        body = await request.json() if request.can_read_body else None
        seen.append((request.method, request.path, dict(request.query), body))
        assert (
            request.headers["authorization"]
            == "Bearer pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"
        )
        if request.path.endswith("/analytics"):
            data = {"campaignId": "campaign_1", "followUps": REPORT}
        elif request.path.endswith("/recipients"):
            data = [
                {"id": "recipient_1", "followUp": {**SUMMARY, "future": True}},
                {"id": "recipient_2", "followUp": None},
                {"id": "recipient_3"},
            ]
        else:
            data = {"id": "campaign_1", "followUp": configuration}
            if request.method == "PATCH" and body.get("followUp") is None:
                data["followUp"] = None
        payload = {"data": data}
        if surface == "messaging":
            payload["success"] = True
        if request.path.endswith("/recipients"):
            payload["page"] = {"nextCursor": None, "hasMore": False}
        return web.json_response(payload, headers={"x-request-id": "req_follow_up"})

    app = web.Application()
    app.router.add_route("*", "/{path:.*}", handler)
    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "127.0.0.1", 0)
    await site.start()
    base_url = f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}"
    cls = AsyncMessagingClient if surface == "messaging" else AsyncClient
    try:
        async with cls(
            Credential(
                "organization_api_key",
                "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
            ),
            base_url=base_url,
        ) as client:
            campaigns = client.campaigns
            if surface == "messaging":
                created = await campaigns.create(
                    "support", {"name": "Offer", "followUp": configuration}
                )
                retrieved = await campaigns.retrieve("support", "campaign_1")
                updated = await campaigns.update(
                    "support", "campaign_1", {"followUp": configuration}
                )
                removed = await campaigns.update("support", "campaign_1", {"followUp": None})
                analytics = await campaigns.analytics("support", "campaign_1")
                recipients = await campaigns.recipients("support", "campaign_1")
            else:
                params = {"projectId": "11111111-1111-4111-8111-111111111111"}
                created = await campaigns.create(
                    {
                        "projectId": "11111111-1111-4111-8111-111111111111",
                        "name": "Offer",
                        "followUp": configuration,
                    }
                )
                retrieved = await campaigns.retrieve("campaign_1", params)
                updated = await campaigns.update("campaign_1", {"followUp": configuration}, params)
                removed = await campaigns.update("campaign_1", {"followUp": None}, params)
                analytics = await campaigns.analytics("campaign_1", params)
                recipients = await campaigns.recipients("campaign_1", params)
            for response in (created, retrieved, updated):
                assert response.data["data"]["followUp"] == configuration
                assert response.metadata.request_id == "req_follow_up"
            assert removed.data["data"]["followUp"] is None
            assert analytics.data["data"]["followUps"] == REPORT
            assert recipients.items[0]["followUp"] == {**SUMMARY, "future": True}
            assert recipients.items[1]["followUp"] is None
            assert "followUp" not in recipients.items[2]
            assert seen[0][3]["followUp"] == configuration
            assert seen[2][3] == {"followUp": configuration}
            assert seen[3][3] == {"followUp": None}
            assert [row[0] for row in seen] == ["POST", "GET", "PATCH", "PATCH", "GET", "GET"]
            assert all(row[1].startswith(prefix) for row in seen)
            assert all(
                row[2]
                == (
                    {}
                    if surface == "messaging" or index == 0
                    else {"projectId": "11111111-1111-4111-8111-111111111111"}
                )
                for index, row in enumerate(seen)
            )
    finally:
        await runner.cleanup()


@pytest.mark.parametrize("surface", ["messaging", "platform"])
async def test_follow_up_enrollment_refusal_preserves_api_error(surface):
    import httpx

    seen = []

    def handler(request):
        seen.append(request)
        return httpx.Response(
            403,
            json={"error": {"code": "feature_unavailable", "message": "Enrollment required"}},
            headers={"x-request-id": "req_denied"},
        )

    cls = AsyncMessagingClient if surface == "messaging" else AsyncClient
    async with cls(
        Credential(
            "organization_api_key",
            "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k",
        ),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(AuthorizationError) as caught:
            if surface == "messaging":
                await client.campaigns.create(
                    "support",
                    {"name": "Offer", "followUp": {"message": {"type": "text", "text": "Hi"}}},
                )
            else:
                await client.campaigns.create(
                    {
                        "projectId": "11111111-1111-4111-8111-111111111111",
                        "name": "Offer",
                        "followUp": {"message": {"type": "text", "text": "Hi"}},
                    }
                )
        assert caught.value.code == "feature_unavailable"
        assert caught.value.request_id == "req_denied"
        assert len(seen) == 1
