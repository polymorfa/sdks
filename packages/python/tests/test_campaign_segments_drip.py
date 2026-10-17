"""Frequency caps, audience segments and drips against the pinned contracts.

Wire expectations come from contracts/campaign-frequency-cap.json,
contracts/campaign-segments-drip.json and the pinned TypeScript producer tests.
"""

import contextlib
import json
from pathlib import Path
from typing import get_args, get_type_hints

import pytest
from aiohttp import web

from polymorfa import (
    AsyncClient,
    AsyncMessagingClient,
    AuthorizationError,
    CancelledError,
    ConfigurationError,
    ConflictError,
    Credential,
    RequestOptions,
    ServerError,
    ValidationError,
)
from polymorfa import audience_segments as S
from polymorfa import campaign_contract_models as M
from polymorfa import campaign_models as C

ROOT = Path(__file__).resolve().parents[3]
CAP = json.loads((ROOT / "contracts/campaign-frequency-cap.json").read_text())
SEG = json.loads((ROOT / "contracts/campaign-segments-drip.json").read_text())
PROJECT = "11111111-1111-4111-8111-111111111111"
ID = "22222222-2222-4222-8222-222222222222"
KEY = Credential("organization_api_key", "pmfa_" + "a" * 72)
RULES = {
    "match": "all",
    "groups": [
        {
            "match": "any",
            "conditions": [
                {"field": "tag", "operator": "contains", "value": "vip"},
                {"field": "attribute", "name": "spend", "operator": "greater_than", "value": 100},
                {"field": "consent", "operator": "equals", "value": True},
            ],
        }
    ],
}
SEGMENT = {"id": ID, "name": "VIP", "revision": 2, "rules": RULES, "createdAt": 1, "updatedAt": 2}
PREVIEW = {
    "matchedCount": 4,
    "optedOutCount": 1,
    "consentWithheldCount": 1,
    "eligibleCount": 2,
    "sample": [{"phone": "+49*******12", "tags": ["vip"]}],
    "evaluatedAt": 3,
}
DRIP_STATS = {
    "enrollment": "continuous",
    "enrolled": 3,
    "enrolledByApi": 1,
    "active": 1,
    "completed": 1,
    "exited": 1,
    "steps": [
        {
            "step": 0,
            "entered": 3,
            "waiting": 1,
            "sent": 2,
            "delivered": 2,
            "read": 1,
            "replied": 1,
            "exited": 1,
            "failed": 0,
        }
    ],
}


class Server:
    def __init__(self, respond):
        self.respond, self.seen = respond, []

    async def __aenter__(self):
        async def handler(request):
            raw = await request.read()
            self.seen.append(
                {
                    "method": request.method,
                    "path": request.raw_path.split("?")[0],
                    "query": request.query_string,
                    "body": json.loads(raw) if raw else None,
                    "headers": {k.lower(): v for k, v in request.headers.items()},
                }
            )
            status, payload = self.respond(len(self.seen) - 1, self.seen[-1])
            return web.json_response(payload, status=status, headers={"x-request-id": "req_seg"})

        app = web.Application()
        app.router.add_route("*", "/{path:.*}", handler)
        self.runner = web.AppRunner(app)
        await self.runner.setup()
        site = web.TCPSite(self.runner, "127.0.0.1", 0)
        await site.start()
        self.url = f"http://127.0.0.1:{site._server.sockets[0].getsockname()[1]}"
        return self

    async def __aexit__(self, *args):
        await self.runner.cleanup()


@contextlib.asynccontextmanager
async def clients(respond, **options):
    async with (
        Server(respond) as server,
        AsyncClient(KEY, base_url=server.url, **options) as client,
        AsyncMessagingClient(KEY, base_url=server.url, **options) as messaging,
    ):
        yield server, client, messaging


def reply(status, payload):
    return lambda i, request: (status, payload)


def error(code):
    return {
        "error": {"code": code, "message": "Unavailable, deleted segment or evaluation timeout"}
    }


def test_types_match_pinned_supplements():
    assert CAP["commit"] == "e404a727ddb4abf42a8df768a5336fad922cc99a"
    assert SEG["commit"] == "f46ebd5162453e812dafa76ce02b420ddabe6921"
    platform = CAP["sources"]["platform"]["schemas"]
    for model, name in (
        (C.FrequencyCapSettings, "CampaignFrequencyCapSettings"),
        (C.UpdateFrequencyCap, "UpdateCampaignFrequencyCapInput"),
    ):
        assert set(get_type_hints(model)) == set(platform[name]["properties"])
        assert model.__required_keys__ == set(platform[name]["required"])
    assert (
        list(get_args(M.CampaignRecipientFailureReason))
        == platform["CampaignRecipientFailureReason"]["enum"]
    )
    schemas = SEG["sources"]["platform"]["schemas"]
    for model, name in (
        (S.AudienceSegment, "AudienceSegment"),
        (S.AudienceSegmentPreview, "AudienceSegmentPreview"),
        (C.Drip, "CampaignDrip"),
        (C.DripInput, "CampaignDripInput"),
        (C.DripPatch, "CampaignDripPatch"),
        (C.DripStats, "CampaignDripStats"),
        (C.Enrollment, "CampaignEnrollment"),
        (C.EnrollPlatformContact, "EnrollCampaignContactRequest"),
    ):
        assert set(get_type_hints(model)) == set(schemas[name]["properties"]), name
        required = set(schemas[name].get("required", []))
        if model is C.EnrollPlatformContact:
            # Organization API keys must select the owning project explicitly.
            required |= {"projectId"}
        assert model.__required_keys__ == required, name
    step = SEG["sources"]["messaging"]["schemas"]["CampaignDripStepStats"]
    assert set(get_type_hints(C.DripStepStats)) == set(step["properties"])
    for source in SEG["sources"].values():
        assert len(source["sourceSha256"]) == 64
        assert '"default"' not in json.dumps(source["schemas"]["CampaignDripPatch"])
    fields = SEG["sources"]["platform"]["fields"]
    assert fields["CampaignMessage.sendWindow"]["properties"]["hours"]["maxItems"] == 4
    assert {"delayUnit", "sendWindow"} <= set(get_type_hints(C.CampaignMessageFields))
    for name in ("drip", "enrollmentOpen", "pauseReason", "segmentId", "segmentSnapshot"):
        assert name in C.Campaign.__optional_keys__
    assert "frequencyCap" in C.Campaign.__optional_keys__
    for model in (C.Analytics, C.PlatformAnalytics):
        assert {"drip", "frequencyCap"} <= model.__optional_keys__
    assert "segmentId" in C.CreatePlatformCampaign.__optional_keys__
    assert "segmentId" in C.UpdatePlatformCampaign.__optional_keys__
    assert "segmentId" not in C.UpdateCampaign.__optional_keys__
    for model in (C.CreateCampaign, C.CreatePlatformCampaign, C.UpdateCampaign):
        assert {"drip", "frequencyCap"} <= model.__optional_keys__
    assert list(get_args(C.DripExitReason)) == ["replied", "link_clicked", "opted_out"]


async def test_frequency_cap_read_replace_remove_and_errors():
    def respond(i, request):
        body = request["body"] or {"maxPer24Hours": 2, "maxPer7Days": 5}
        return 200, {
            "data": {
                "teamId": PROJECT,
                "maxPer24Hours": body["maxPer24Hours"],
                "maxPer7Days": body["maxPer7Days"],
                "revision": i + 1,
                "updatedAt": None if i == 0 else 1800000000000,
            }
        }

    async with clients(respond, max_network_retries=2) as (server, client, _messaging):
        read = await client.campaigns.get_frequency_cap()
        saved = await client.campaigns.update_frequency_cap(
            {"maxPer24Hours": 2, "maxPer7Days": 5, "revision": read.data["data"]["revision"]}
        )
        await client.campaigns.update_frequency_cap(
            {
                "maxPer24Hours": None,
                "maxPer7Days": None,
                "revision": saved.data["data"]["revision"],
            }
        )
    assert read.data["data"]["updatedAt"] is None
    assert [(r["method"], r["path"], r["query"]) for r in server.seen] == [
        ("GET", "/platform/campaign-settings/frequency-cap", ""),
        ("PUT", "/platform/campaign-settings/frequency-cap", ""),
        ("PUT", "/platform/campaign-settings/frequency-cap", ""),
    ]
    assert server.seen[1]["body"] == {"maxPer24Hours": 2, "maxPer7Days": 5, "revision": 1}
    assert server.seen[2]["body"] == {"maxPer24Hours": None, "maxPer7Days": None, "revision": 2}
    assert all(r["headers"]["polymorfa-version"] == "2026-09-22" for r in server.seen)

    for status, code, kind in (
        (409, "conflict", ConflictError),
        (403, "feature_unavailable", AuthorizationError),
        (503, "unavailable", ServerError),
    ):
        async with clients(reply(status, error(code)), max_network_retries=2) as (
            server,
            client,
            _messaging,
        ):
            with pytest.raises(kind) as raised:
                await client.campaigns.update_frequency_cap(
                    {"maxPer24Hours": 1, "maxPer7Days": 1, "revision": 0},
                    options=RequestOptions(headers={"x-caller": "kept"}),
                )
        assert raised.value.code == code and raised.value.status == status
        assert raised.value.request_id == "req_seg"
        assert len(server.seen) == 1 and server.seen[0]["headers"]["x-caller"] == "kept"


async def test_frequency_cap_fields_reasons_and_analytics_on_both_surfaces():
    limits = {"maxPer24Hours": 2, "maxPer7Days": 5}

    def respond(i, request):
        if request["path"].endswith("/analytics"):
            data = {"campaignId": "c", "frequencyCap": {"skippedRecipientCount": 3}}
        elif request["path"].endswith("/recipients"):
            data = [{"failureReason": "frequency_cap", "lastError": "frequency_cap_exceeded"}]
        else:
            data = {"id": "c", "frequencyCap": {"maxPer24Hours": 2, "maxPer7Days": None}}
        return 200, {"success": True, "data": data, "page": {"hasMore": False, "nextCursor": None}}

    params = {"projectId": PROJECT}
    async with clients(respond) as (server, client, messaging):
        await client.campaigns.create({"projectId": PROJECT, "name": "cap", "frequencyCap": limits})
        await client.campaigns.update("c", {"frequencyCap": None}, params)
        await messaging.campaigns.create(PROJECT, {"name": "cap", "frequencyCap": limits})
        await messaging.campaigns.update(PROJECT, "c", {"frequencyCap": None})
        reason = {"status": "skipped", "reason": "frequency_cap"}
        platform_page = await client.campaigns.recipients("c", {**params, **reason})
        messaging_page = await messaging.campaigns.recipients(PROJECT, "c", reason)
        campaign = await client.campaigns.retrieve("c", params)
        messaging_campaign = await messaging.campaigns.retrieve(PROJECT, "c")
        analytics = await client.campaigns.analytics("c", params)
        messaging_analytics = await messaging.campaigns.analytics(PROJECT, "c")
    assert [r["body"] for r in server.seen[:4]] == [
        {"projectId": PROJECT, "name": "cap", "frequencyCap": limits},
        {"frequencyCap": None},
        {"name": "cap", "frequencyCap": limits},
        {"frequencyCap": None},
    ]
    assert all("reason=frequency_cap" in r["query"] for r in server.seen[4:6])
    assert platform_page.items[0]["failureReason"] == "frequency_cap"
    assert messaging_page.items[0]["lastError"] == "frequency_cap_exceeded"
    assert campaign.data["data"]["frequencyCap"]["maxPer7Days"] is None
    assert messaging_campaign.data["data"]["frequencyCap"]["maxPer24Hours"] == 2
    assert analytics.data["data"]["frequencyCap"]["skippedRecipientCount"] == 3
    assert messaging_analytics.data["data"]["frequencyCap"]["skippedRecipientCount"] == 3
    from polymorfa import campaign_contract_validation as V

    assert V.export({"reason": "frequency_cap"})["reason"] == "frequency_cap"


async def test_segment_wire_revisions_pagination_and_previews():
    def respond(i, request):
        path, method = request["path"], request["method"]
        if method == "GET" and path == "/platform/audience-segments":
            last = "cursor=next" in request["query"]
            return 200, {
                "data": [SEGMENT],
                "page": {"hasMore": not last, "nextCursor": None if last else "next"},
            }
        if path.endswith("/preview") and method == "GET":
            return 200, {"data": {**PREVIEW, "revision": 2}}
        if path.endswith("/preview"):
            return 200, {"data": PREVIEW}
        if method == "DELETE":
            return 200, {"data": {"deleted": True, "id": ID}}
        return 200, {"data": SEGMENT}

    async with clients(respond, max_network_retries=2) as (server, client, _messaging):
        segments = client.audience_segments
        page = await segments.list({"limit": 10})
        following = await page.next_page()
        retrieved = await segments.retrieve("s/1")
        await segments.create({"name": "VIP", "rules": RULES})
        await segments.update("s", {"expectedRevision": 1, "rules": RULES})
        saved = await segments.preview("s")
        ad_hoc = await segments.preview_rules(RULES)
        deleted = await segments.delete("s", 2)
        assert not hasattr(client.project(PROJECT), "audience_segments")
    assert page.items[0]["revision"] == 2 and following is not None and not following.has_more
    assert retrieved.data["data"]["rules"] == RULES
    assert saved.data["data"]["revision"] == 2 and ad_hoc.data["data"]["eligibleCount"] == 2
    assert deleted.data["data"] == {"deleted": True, "id": ID}
    assert [(r["method"], r["path"], r["query"], r["body"]) for r in server.seen] == [
        ("GET", "/platform/audience-segments", "limit=10", None),
        ("GET", "/platform/audience-segments", "limit=10&cursor=next", None),
        ("GET", "/platform/audience-segments/s%2F1", "", None),
        ("POST", "/platform/audience-segments", "", {"name": "VIP", "rules": RULES}),
        ("PATCH", "/platform/audience-segments/s", "", {"expectedRevision": 1, "rules": RULES}),
        ("GET", "/platform/audience-segments/s/preview", "", None),
        ("POST", "/platform/audience-segments/preview", "", {"rules": RULES}),
        ("DELETE", "/platform/audience-segments/s", "expectedRevision=2", None),
    ]


@pytest.mark.parametrize(
    ("status", "code", "kind"),
    [
        (403, "feature_unavailable", AuthorizationError),
        (403, "permission_denied", AuthorizationError),
        (409, "state_conflict", ConflictError),
        (503, "unavailable", ServerError),
    ],
)
async def test_segment_writes_and_previews_are_sent_once(status, code, kind):
    async with clients(reply(status, error(code)), max_network_retries=2) as (
        server,
        client,
        _messaging,
    ):
        segments = client.audience_segments
        calls = (
            lambda: segments.update("s", {"expectedRevision": 2, "name": "new"}),
            lambda: segments.create({"name": "n", "rules": RULES}),
            lambda: segments.delete("s", 2),
            lambda: segments.preview("s"),
            lambda: segments.preview_rules(RULES),
        )
        for index, call in enumerate(calls):
            with pytest.raises(kind) as raised:
                await call()
            assert raised.value.code == code and raised.value.status == status
            assert len(server.seen) == index + 1


async def test_segment_reads_keep_retry_policy_and_inputs_fail_closed():
    async with clients(
        lambda i, r: (503, error("unavailable")) if i < 2 else (200, {"data": SEGMENT}),
        max_network_retries=2,
    ) as (server, client, _messaging):
        await client.audience_segments.retrieve("s")
        for bad in ("", " "):
            with pytest.raises(ConfigurationError):
                await client.audience_segments.retrieve(bad)
        for rules in (
            {"match": "all", "groups": [{"match": "all", "conditions": [{"field": "future"}]}]},
            {
                "match": "all",
                "groups": [
                    {
                        "match": "all",
                        "conditions": [
                            {
                                "field": "attribute",
                                "name": "x",
                                "operator": "equals",
                                "value": [1],
                            }
                        ],
                    }
                ],
            },
            {
                "match": "all",
                "groups": [
                    {
                        "match": "all",
                        "conditions": [
                            {
                                "field": "attribute",
                                "name": "x",
                                "operator": "in",
                                "values": [True],
                            }
                        ],
                    }
                ],
            },
            {
                "match": "all",
                "groups": [
                    {
                        "match": "all",
                        "conditions": [
                            {
                                "field": "attribute",
                                "name": "x",
                                "operator": "greater_than",
                                "value": "1",
                            }
                        ],
                    }
                ],
            },
            {
                "match": "all",
                "groups": [
                    {
                        "match": "all",
                        "conditions": [{"field": "consent", "operator": "equals", "value": 1}],
                    }
                ],
            },
            {
                "match": "all",
                "groups": [
                    {
                        "match": "all",
                        "conditions": [
                            {"field": "tag", "operator": "contains", "value": "a", "extra": 1}
                        ],
                    }
                ],
            },
        ):
            with pytest.raises(ValidationError):
                await client.audience_segments.preview_rules(rules)
    assert len(server.seen) == 3


async def test_drip_partial_patch_enrollment_and_stored_reads():
    def respond(i, request):
        if request["path"].endswith("/enrollments"):
            data = {
                "campaignId": ID,
                "recipientId": PROJECT,
                "phone": "+5511999990000",
                "created": False,
                "status": "skipped",
                "enrolledAt": 1800000000000,
            }
        else:
            data = {
                "id": "c",
                "drip": {"enrollment": "audience", "exitOnReply": False, "exitOnLinkClick": True},
                "enrollmentOpen": False,
                "pauseReason": None,
                "segmentId": None,
                "segmentSnapshot": {"revision": 3, "evaluatedAt": 1, "matchedCount": 4},
            }
        return 200, {"success": True, "data": data}

    window = {"days": ["monday"], "hours": [{"start": "09:00", "end": "17:00"}]}
    steps = [
        {"source": "hi"},
        {"source": "later", "delayAfterSec": 2592000, "delayUnit": "days", "sendWindow": window},
    ]
    params = {"projectId": PROJECT}
    async with clients(respond, max_network_retries=2) as (server, client, messaging):
        await client.campaigns.create(
            {
                "projectId": PROJECT,
                "name": "VIP drip",
                "segmentId": "s",
                "drip": {"enrollment": "continuous"},
                "messagesArray": steps,
            }
        )
        await client.campaigns.update("c", {"drip": {"enrollment": "audience"}}, params)
        await messaging.campaigns.update(PROJECT, "c", {"drip": {"enrollment": "audience"}})
        await client.campaigns.update("c", {"drip": None, "segmentId": None}, params)
        enrolled = await client.campaigns.enroll(
            "c/1", {"projectId": PROJECT, "phone": "+5511999990000"}
        )
        menrolled = await messaging.campaigns.enroll(
            PROJECT, "c", {"phone": "+5511999990000", "variables": {"vip": True}}
        )
        stored = await messaging.campaigns.retrieve(PROJECT, "c")
        platform_stored = await client.campaigns.retrieve("c", params)
    assert [r["body"] for r in server.seen[:6]] == [
        {
            "projectId": PROJECT,
            "name": "VIP drip",
            "segmentId": "s",
            "drip": {"enrollment": "continuous"},
            "messagesArray": steps,
        },
        {"drip": {"enrollment": "audience"}},
        {"drip": {"enrollment": "audience"}},
        {"drip": None, "segmentId": None},
        {"projectId": PROJECT, "phone": "+5511999990000"},
        {"phone": "+5511999990000", "variables": {"vip": True}},
    ]
    assert server.seen[4]["path"] == "/platform/campaigns/c%2F1/enrollments"
    assert server.seen[4]["query"] == ""
    assert server.seen[5]["path"] == f"/messaging/projects/{PROJECT}/campaigns/c/enrollments"
    assert all(f"projectId={PROJECT}" in server.seen[i]["query"] for i in (1, 3))
    assert enrolled.data["data"]["created"] is False
    assert menrolled.data["data"]["enrolledAt"] == 1800000000000
    data = stored.data["data"]
    assert data["enrollmentOpen"] is False and data["segmentSnapshot"]["revision"] == 3
    assert data["pauseReason"] is None and data["segmentId"] is None
    assert platform_stored.data["data"]["drip"]["exitOnLinkClick"] is True


async def test_enrollment_is_never_replayed_and_requires_project_context():
    async with clients(lambda i, r: (503, error("unavailable")), max_network_retries=2) as (
        server,
        client,
        messaging,
    ):
        with pytest.raises(ServerError):
            await client.campaigns.enroll("c", {"projectId": PROJECT, "phone": "+1"})
        with pytest.raises(ServerError):
            await messaging.campaigns.enroll(
                PROJECT, "c", {"phone": "+1"}, options=RequestOptions(idempotency_key="caller")
            )
        for bad in ({"phone": "+1"}, {"projectId": "not-a-uuid", "phone": "+1"}):
            with pytest.raises((ConfigurationError, ValidationError)):
                await client.campaigns.enroll("c", bad)
    assert len(server.seen) == 2
    assert server.seen[1]["headers"]["idempotency-key"] == "caller"
    assert "idempotency-key" not in server.seen[0]["headers"]


async def test_drip_step_bounds_and_per_step_analytics():
    def respond(i, request):
        if request["path"].endswith("/analytics"):
            data = {"campaignId": "c", "drip": DRIP_STATS}
        elif request["path"].endswith("/recipients"):
            data = [{"messagesSent": 1, "nextMessageAt": None, "sequenceError": "link_clicked"}]
        else:
            data = {}
        return 200, {"success": True, "data": data, "page": {"hasMore": False, "nextCursor": None}}

    def step(delay):
        return [{"source": "later", "delayAfterSec": delay}]

    params = {"projectId": PROJECT}
    async with clients(respond) as (server, client, messaging):
        for body in (
            {"projectId": PROJECT, "name": "ordinary", "messagesArray": step(86401)},
            {
                "projectId": PROJECT,
                "name": "ordinary",
                "drip": None,
                "messagesArray": step(86401),
            },
        ):
            with pytest.raises(ValidationError, match="delayAfterSec"):
                await client.campaigns.create(body)
        await client.campaigns.create(
            {"projectId": PROJECT, "name": "drip", "drip": {}, "messagesArray": step(2592000)}
        )
        await client.campaigns.update("c", {"messagesArray": step(2592000)}, params)
        with pytest.raises(ValidationError, match="delayAfterSec"):
            await client.campaigns.update("c", {"messagesArray": step(2592001)}, params)
        assert len(server.seen) == 2
        assert server.seen[1]["body"] == {"messagesArray": step(2592000)}
        analytics = await client.campaigns.analytics("c", params)
        messaging_analytics = await messaging.campaigns.analytics(PROJECT, "c")
        recipients = await client.campaigns.recipients("c", params)
    assert analytics.data["data"]["drip"] == DRIP_STATS
    assert messaging_analytics.data["data"]["drip"]["steps"][0]["exited"] == 1
    assert recipients.items[0]["sequenceError"] == "link_clicked"


async def test_frequency_cap_cancellation_sends_nothing():
    import asyncio

    async with clients(lambda i, r: (200, {"data": {}})) as (server, client, _messaging):
        task = asyncio.ensure_future(
            client.campaigns.update_frequency_cap(
                {"maxPer24Hours": None, "maxPer7Days": None, "revision": 0}
            )
        )
        task.cancel()
        with pytest.raises((asyncio.CancelledError, CancelledError)):
            await task
    assert server.seen == []
