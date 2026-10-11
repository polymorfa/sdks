import json

import httpx
import pytest

from polymorfa import AsyncClient, AsyncMessagingClient, Credential, RequestOptions, ValidationError

WINDOW = {
    "days": ["monday"],
    "hours": [{"start": "09:00", "end": "17:00"}],
    "timeZone": "UTC",
    "recipientTimeZone": True,
    "timeZoneVariable": "tz",
}
VARIANT = {
    "key": "a",
    "label": "First",
    "weight": 50,
    "blueprint": {"version": 2, "source": "Hello {{name}}", "future": True},
}
STRATEGY = {
    "winnerCriterion": "read",
    "holdoutPercent": 10,
    "testSlicePercent": 20,
    "autoPromote": True,
    "testWindowMinutes": 30,
}
EXPERIMENT = {
    "criterion": "read",
    "outcome": {"state": "promoted", "winnerKey": "a"},
    "holdoutCount": 1,
    "reserveCount": 8,
    "variants": [
        {
            "key": "a",
            "label": "First",
            "weight": 50,
            "assigned": 2,
            "sent": 2,
            "delivered": 2,
            "read": 1,
            "replied": 1,
            "outcomeRate": 0.5,
        }
    ],
}
CAMPAIGN = {
    "id": "campaign_1",
    "name": "Offer",
    "status": "draft",
    "templateId": None,
    "recipientListId": "audience_1",
    "recipientCount": 3,
    "sentCount": 0,
    "deliveredCount": 0,
    "readCount": 0,
    "failedCount": 0,
    "skippedCount": 0,
    "scheduledAt": None,
    "launchedAt": None,
    "completedAt": None,
    "createdAt": 1,
    "updatedAt": 2,
    "sendWindow": WINDOW,
    "composerBlueprint": None,
    "messages": [],
    "audienceRef": None,
    "senderConfig": {"sessionIds": ["session_1"]},
    "complianceConfig": None,
    "variants": [VARIANT],
    "variantStrategy": STRATEGY,
    "experimentOutcome": None,
    "messageVariations": None,
    "future": {"preserved": True},
}
RECIPIENT = {
    "id": "recipient_1",
    "phone": "+15551234567",
    "variables": {"name": "Ada"},
    "variantKey": "a",
    "status": "queued",
    "attempts": 0,
    "lastError": None,
    "externalMessageId": None,
    "queuedAt": 1,
    "sentAt": None,
    "deliveredAt": None,
    "readAt": None,
    "failedAt": None,
    "respondedAt": None,
}
ANALYTICS = {
    "campaignId": "campaign_1",
    "recipientCount": 3,
    "sentCount": 2,
    "deliveredCount": 2,
    "readCount": 1,
    "failedCount": 0,
    "skippedCount": 0,
    "respondedCount": 1,
    "responseRate": 0.5,
    "experiment": EXPERIMENT,
}
ADD = {
    "recipients": [
        {"phone": "+15551234567", "variables": {"name": "Ada", "discount": 1.5, "member": True}}
    ]
}
ADDED = {
    "campaignId": "campaign_1",
    "added": 1,
    "recipientCount": 3,
    "duplicateCount": 1,
    "invalidCount": 1,
    "invalidRows": [{"row": 3, "reason": "missing_phone"}],
}
CREATE = {
    "name": "Offer",
    "recipients": ADD["recipients"],
    "sendWindow": WINDOW,
    "variants": [VARIANT],
    "variantStrategy": STRATEGY,
}
PROJECT = {"projectId": "project_1"}
PADD = {**PROJECT, **ADD}
CONVERSION = {
    "id": "conversion_1",
    "campaignId": "campaign_1",
    "recipientId": "recipient_1",
    "eventType": "purchase",
    "occurredAt": "2026-10-11T00:00:00Z",
    "value": {"amountMinor": 123, "currency": "USD"},
    "evidence": "customer_reported",
    "attribution": {"outcome": "attributed", "touchAt": "2026-10-10T00:00:00Z", "windowDays": 7},
    "recordedAt": "2026-10-11T00:00:01Z",
    "replayed": False,
}
REPORT = {
    "campaignId": "campaign_1",
    "model": {"touch": "recipient_sent", "windowDays": 7, "correlation": "explicit_recipient"},
    "sentCount": 2,
    "conversions": {"total": 2, "attributed": 1, "outsideWindow": 1, "notSent": 0, "optedOut": 0},
    "convertedRecipients": 1,
    "conversionRate": 0.5,
    "values": [
        {
            "currency": "USD",
            "evidence": "customer_reported",
            "attributedConversions": 1,
            "attributedAmountMinor": "9007199254740993",
            "unattributedConversions": 1,
            "unattributedAmountMinor": "123",
        }
    ],
}
BASE = "/messaging/projects/support/campaigns"
PBASE = "/platform/campaigns"
ID = "/campaign_1"
CURSOR = {"status": "queued", "cursor": "cursor_1", "limit": 10}
PAGE = {"nextCursor": None, "hasMore": False}

# Every callable invokes one public method; exact route/query/body and full decoded DTO are checked.
MESSAGING = [
    ("list", "GET", BASE, None, {}, [CAMPAIGN], lambda r, o: r.list("support", options=o)),
    (
        "create",
        "POST",
        BASE,
        CREATE,
        {},
        CAMPAIGN,
        lambda r, o: r.create("support", CREATE, options=o),
    ),
    (
        "retrieve",
        "GET",
        BASE + ID,
        None,
        {},
        CAMPAIGN,
        lambda r, o: r.retrieve("support", "campaign_1", options=o),
    ),
    (
        "update",
        "PATCH",
        BASE + ID,
        {"recipientListId": None},
        {},
        CAMPAIGN,
        lambda r, o: r.update("support", "campaign_1", {"recipientListId": None}, options=o),
    ),
    (
        "analytics",
        "GET",
        BASE + ID + "/analytics",
        None,
        {},
        ANALYTICS,
        lambda r, o: r.analytics("support", "campaign_1", options=o),
    ),
    (
        "launch",
        "POST",
        BASE + ID + "/launch",
        {},
        {},
        {**CAMPAIGN, "operationId": "op_1"},
        lambda r, o: r.launch("support", "campaign_1", options=o),
    ),
    (
        "reschedule",
        "POST",
        BASE + ID + "/reschedule",
        {"scheduledAt": None},
        {},
        {**CAMPAIGN, "operationId": "op_1"},
        lambda r, o: r.reschedule("support", "campaign_1", {"scheduledAt": None}, options=o),
    ),
    (
        "pause",
        "POST",
        BASE + ID + "/pause",
        None,
        {},
        {**CAMPAIGN, "operationId": "op_1"},
        lambda r, o: r.pause("support", "campaign_1", options=o),
    ),
    (
        "resume",
        "POST",
        BASE + ID + "/resume",
        None,
        {},
        {**CAMPAIGN, "operationId": "op_1"},
        lambda r, o: r.resume("support", "campaign_1", options=o),
    ),
    (
        "stop",
        "POST",
        BASE + ID + "/stop",
        None,
        {},
        {**CAMPAIGN, "operationId": None},
        lambda r, o: r.stop("support", "campaign_1", options=o),
    ),
    (
        "recipients",
        "GET",
        BASE + ID + "/recipients",
        None,
        CURSOR,
        [RECIPIENT],
        lambda r, o: r.recipients("support", "campaign_1", CURSOR, options=o),
    ),
    (
        "add_recipients",
        "POST",
        BASE + ID + "/recipients",
        ADD,
        {},
        ADDED,
        lambda r, o: r.add_recipients("support", "campaign_1", ADD, options=o),
    ),
    (
        "requeue",
        "POST",
        BASE + ID + "/requeue",
        {"includeSkippedError": True},
        {},
        {"requeued": 2},
        lambda r, o: r.requeue("support", "campaign_1", {"includeSkippedError": True}, options=o),
    ),
]
PLATFORM = [
    (
        "list",
        "GET",
        PBASE,
        None,
        {**PROJECT, "projectSlug": "support"},
        [CAMPAIGN],
        lambda r, o: r.list({**PROJECT, "projectSlug": "support"}, options=o),
    ),
    (
        "create",
        "POST",
        PBASE,
        {**PROJECT, **CREATE},
        {},
        CAMPAIGN,
        lambda r, o: r.create({**PROJECT, **CREATE}, options=o),
    ),
    (
        "retrieve",
        "GET",
        PBASE + ID,
        None,
        PROJECT,
        CAMPAIGN,
        lambda r, o: r.retrieve("campaign_1", PROJECT, options=o),
    ),
    (
        "update",
        "PATCH",
        PBASE + ID,
        {"recipientListId": None},
        PROJECT,
        CAMPAIGN,
        lambda r, o: r.update("campaign_1", {"recipientListId": None}, PROJECT, options=o),
    ),
    (
        "delete",
        "DELETE",
        PBASE + ID,
        None,
        PROJECT,
        {"removed": True},
        lambda r, o: r.delete("campaign_1", PROJECT, options=o),
    ),
    (
        "launch",
        "POST",
        PBASE + ID + "/launch",
        PROJECT,
        {},
        {"operationId": "op_1"},
        lambda r, o: r.launch("campaign_1", PROJECT, options=o),
    ),
    (
        "reschedule",
        "POST",
        PBASE + ID + "/reschedule",
        {**PROJECT, "scheduledAt": None},
        {},
        {"operationId": "op_1"},
        lambda r, o: r.reschedule("campaign_1", {**PROJECT, "scheduledAt": None}, options=o),
    ),
    (
        "pause",
        "POST",
        PBASE + ID + "/pause",
        PROJECT,
        {},
        {"operationId": "op_1"},
        lambda r, o: r.pause("campaign_1", PROJECT, options=o),
    ),
    (
        "resume",
        "POST",
        PBASE + ID + "/resume",
        PROJECT,
        {},
        {"operationId": "op_1"},
        lambda r, o: r.resume("campaign_1", PROJECT, options=o),
    ),
    (
        "stop",
        "POST",
        PBASE + ID + "/stop",
        PROJECT,
        {},
        {"operationId": None},
        lambda r, o: r.stop("campaign_1", PROJECT, options=o),
    ),
    (
        "archive",
        "POST",
        PBASE + ID + "/archive",
        PROJECT,
        {},
        {"archived": True},
        lambda r, o: r.archive("campaign_1", PROJECT, options=o),
    ),
    (
        "duplicate",
        "POST",
        PBASE + ID + "/duplicate",
        PROJECT,
        {},
        {"id": "campaign_2"},
        lambda r, o: r.duplicate("campaign_1", PROJECT, options=o),
    ),
    (
        "requeue",
        "POST",
        PBASE + ID + "/requeue",
        PROJECT,
        {},
        {"requeued": 2},
        lambda r, o: r.requeue("campaign_1", PROJECT, options=o),
    ),
    (
        "analytics",
        "GET",
        PBASE + ID + "/analytics",
        None,
        PROJECT,
        {**ANALYTICS, "averageResponseTimeMs": 1.5, "minResponseTimeMs": 1, "maxResponseTimeMs": 2},
        lambda r, o: r.analytics("campaign_1", PROJECT, options=o),
    ),
    (
        "events",
        "GET",
        PBASE + ID + "/events",
        None,
        PROJECT,
        {"futureEvent": "preserved"},
        lambda r, o: r.events("campaign_1", PROJECT, options=o),
    ),
    (
        "recipients",
        "GET",
        PBASE + ID + "/recipients",
        None,
        {**PROJECT, **CURSOR},
        [RECIPIENT],
        lambda r, o: r.recipients("campaign_1", {**PROJECT, **CURSOR}, options=o),
    ),
    (
        "add_recipients",
        "POST",
        PBASE + ID + "/recipients",
        PADD,
        {},
        ADDED,
        lambda r, o: r.add_recipients("campaign_1", PADD, options=o),
    ),
    (
        "record_conversion",
        "POST",
        PBASE + ID + "/conversions",
        {
            **PROJECT,
            "recipientId": "recipient_1",
            "eventId": "order_1",
            "eventType": "purchase",
            "occurredAt": CONVERSION["occurredAt"],
            "value": CONVERSION["value"],
        },
        {},
        CONVERSION,
        lambda r, o: r.record_conversion(
            "campaign_1",
            {
                **PROJECT,
                "recipientId": "recipient_1",
                "eventId": "order_1",
                "eventType": "purchase",
                "occurredAt": CONVERSION["occurredAt"],
                "value": CONVERSION["value"],
            },
            options=o,
        ),
    ),
    (
        "conversions",
        "GET",
        PBASE + ID + "/conversions",
        None,
        PROJECT,
        REPORT,
        lambda r, o: r.conversions("campaign_1", PROJECT, options=o),
    ),
]
AUDIENCE = {
    "id": "audience_1",
    "name": "Leads",
    "source": "csv",
    "recipientCount": 3,
    "fileId": "file_1",
    "columns": ["Phone", "Name"],
    "sampleRow": {"Phone": "+15551234567"},
    "mapping": {"phone": "Phone"},
    "createdAt": 1,
    "updatedAt": 2,
    "duplicateCount": 1,
    "invalidCount": 1,
    "invalidRows": [{"row": 3, "reason": "invalid_phone"}],
}
MEMBER = {"id": "member_1", "phone": "+15551234567", "variables": {"name": "Ada"}, "createdAt": 1}
ABASE = "/platform/audiences"
AID = "/audience_1"
ACREATE = {
    "name": "Leads",
    "source": "csv",
    "fileId": "file_1",
    "mapping": {"phone": "Phone", "variables": {"name": "Name"}},
}
AUDIENCES = [
    (
        "list",
        "GET",
        ABASE,
        None,
        {},
        {"items": [AUDIENCE], "future": True},
        lambda r, o: r.list(options=o),
    ),
    ("create", "POST", ABASE, ACREATE, {}, AUDIENCE, lambda r, o: r.create(ACREATE, options=o)),
    (
        "retrieve",
        "GET",
        ABASE + AID,
        None,
        {},
        AUDIENCE,
        lambda r, o: r.retrieve("audience_1", options=o),
    ),
    (
        "delete",
        "DELETE",
        ABASE + AID,
        None,
        {},
        {"removed": True},
        lambda r, o: r.delete("audience_1", options=o),
    ),
    (
        "create_upload",
        "POST",
        ABASE + "/uploads",
        {"fileName": "leads.csv"},
        {},
        {"fileId": "file_1", "uploadUrl": "https://example.invalid"},
        lambda r, o: r.create_upload({"fileName": "leads.csv"}, options=o),
    ),
    (
        "add_members",
        "POST",
        ABASE + AID + "/members",
        {"members": ADD["recipients"]},
        {},
        {
            "listId": "audience_1",
            "added": 1,
            "recipientCount": 3,
            "duplicateCount": 1,
            "invalidCount": 1,
            "invalidRows": [{"row": 3, "reason": "invalid_phone"}],
        },
        lambda r, o: r.add_members("audience_1", {"members": ADD["recipients"]}, options=o),
    ),
    (
        "list_members",
        "GET",
        ABASE + AID + "/members",
        None,
        {"cursor": "cursor_1", "limit": 10},
        [MEMBER],
        lambda r, o: r.list_members("audience_1", {"cursor": "cursor_1", "limit": 10}, options=o),
    ),
    (
        "delete_member",
        "DELETE",
        ABASE + AID + "/members/+15551234567",
        None,
        {},
        {"removed": True, "listId": "audience_1", "phone": "+15551234567", "recipientCount": 2},
        lambda r, o: r.delete_member("audience_1", "+15551234567", options=o),
    ),
]


@pytest.mark.parametrize(
    "surface,case",
    [
        (surface, case)
        for surface, cases in [
            ("messaging", MESSAGING),
            ("platform", PLATFORM),
            ("audiences", AUDIENCES),
        ]
        for case in cases
    ],
)
async def test_all_public_campaign_and_audience_methods(surface, case):
    name, method, path, body, query, value, invoke = case
    keyed = (
        name in {"create", "launch", "pause", "resume", "stop", "reschedule"}
        and not (surface == "platform" and name == "create")
        and surface != "audiences"
    )

    def handler(request):
        assert request.method == method and request.url.path == path
        assert dict(request.url.params) == {k: str(v) for k, v in query.items()}
        assert (json.loads(request.content) if request.content else None) == body
        assert bool(request.headers.get("idempotency-key")) == keyed
        assert (
            request.headers["x-proof"] == "campaigns"
            and request.headers["polymorfa-version"] == "2026-08-01"
        )
        payload = {"data": value}
        if surface == "messaging":
            payload["success"] = True
        if name in {"recipients", "list_members"}:
            payload["page"] = PAGE
        return httpx.Response(
            200,
            json=payload,
            headers={"x-request-id": "req_campaign", "x-polymorfa-operation-id": "op_receipt"},
        )

    cls = AsyncMessagingClient if surface == "messaging" else AsyncClient
    async with cls(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        resource = client.audiences if surface == "audiences" else client.campaigns
        result = await invoke(
            resource, RequestOptions(headers={"x-proof": "campaigns"}, api_version="2026-08-01")
        )
        response = result.response if name in {"recipients", "list_members"} else result
        assert response.data["data"] == value
        assert (
            response.metadata.request_id == "req_campaign"
            and response.metadata.operation_id == "op_receipt"
        )
        if name in {"recipients", "list_members"}:
            assert result.items == tuple(value)


@pytest.mark.parametrize(
    "surface,method",
    [
        ("messaging", "add_recipients"),
        ("messaging", "update"),
        ("platform", "add_recipients"),
        ("audiences", "add_members"),
    ],
)
@pytest.mark.parametrize("explicit", [False, True])
async def test_append_no_automatic_retry_unless_explicit(surface, method, explicit):
    attempts = []

    def handler(request):
        attempts.append(request)
        if len(attempts) == 1:
            return httpx.Response(
                503,
                json={"error": {"message": "retry", "code": "temporary"}},
                headers={"retry-after": "0"},
            )
        return httpx.Response(200, json={"success": True, "data": ADDED})

    cls = AsyncMessagingClient if surface == "messaging" else AsyncClient
    async with cls(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        options = RequestOptions(
            idempotency_key="manual_key", max_network_retries=1 if explicit else None
        )
        if surface == "audiences":
            call = lambda: client.audiences.add_members(
                "audience_1", {"members": []}, options=options
            )
        elif surface == "platform":
            call = lambda: client.campaigns.add_recipients("campaign_1", PADD, options=options)
        elif method == "update":
            call = lambda: client.campaigns.update(
                "support", "campaign_1", {"name": "New"}, options=options
            )
        else:
            call = lambda: client.campaigns.add_recipients(
                "support", "campaign_1", ADD, options=options
            )
        if explicit:
            await call()
        else:
            from polymorfa import ServerError

            with pytest.raises(ServerError):
                await call()
    assert len(attempts) == (2 if explicit else 1)
    assert all(r.headers["idempotency-key"] == "manual_key" for r in attempts)


async def test_campaign_preflight_validation_and_inline_audience():
    seen = []

    def handler(request):
        seen.append(request)
        assert json.loads(request.content) == {"name": "Empty"}
        return httpx.Response(200, json={"data": AUDIENCE})

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        for options in [
            RequestOptions(idempotency_key="key"),
            RequestOptions(max_network_retries=0),
        ]:
            with pytest.raises(ValidationError):
                await client.campaigns.create({**PROJECT, "name": "Offer"}, options=options)
        for body in [
            {"name": "x", "fileId": "f"},
            {"name": "x", "fileId": "f", "mapping": {"phone": "p"}, "members": []},
            {"name": "x", "mapping": {"phone": "p"}},
        ]:
            with pytest.raises(ValidationError):
                await client.audiences.create(body)
        await client.audiences.create({"name": "Empty"})
    assert len(seen) == 1
    async with AsyncMessagingClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        with pytest.raises(ValidationError):
            await client.campaigns.update("support", "campaign_1", {})


async def test_recipient_pagination_carries_project_status_limit_and_options():
    seen = []

    def handler(request):
        seen.append(dict(request.url.params))
        first = len(seen) == 1
        assert request.headers["x-proof"] == "pages"
        return httpx.Response(
            200,
            json={
                "data": [RECIPIENT],
                "page": {"hasMore": first, "nextCursor": "cursor_2" if first else None},
            },
            headers={"x-request-id": "req_page"},
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        page = await client.campaigns.recipients(
            "campaign_1",
            {**PROJECT, **CURSOR},
            options=RequestOptions(headers={"x-proof": "pages"}),
        )
        assert [row["id"] async for row in page] == ["recipient_1", "recipient_1"]
    assert seen == [
        {**PROJECT, "status": "queued", "cursor": "cursor_1", "limit": "10"},
        {**PROJECT, "status": "queued", "cursor": "cursor_2", "limit": "10"},
    ]
