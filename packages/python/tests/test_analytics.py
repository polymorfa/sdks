import httpx
import pytest

from polymorfa import (
    AsyncClient,
    AsyncProjectClient,
    Credential,
    RequestOptions,
    ServerError,
    ValidationError,
)

PROJECT = "00000000-0000-4000-8000-000000000001"
SESSION = "00000000-0000-4000-8000-000000000002"
CALL = {
    "total": 2,
    "answered": 1,
    "missed": 1,
    "declined": 0,
    "failed": 0,
    "ringing": 0,
    "answerRate": 0.5,
    "talkSeconds": 1.5,
    "timedAnswered": 1,
    "timedPickup": 1,
    "averageTalkSeconds": 1.5,
    "medianTalkSeconds": 1.5,
    "p95TalkSeconds": 1.5,
    "averagePickupMs": 2.5,
    "p95PickupMs": 2.5,
    "shortAnswered": 1,
    "video": 0,
}
CALLBUSINESS = {
    **CALL,
    "directions": {"inbound": CALL, "outbound": CALL},
    "mediaQuality": {
        "measuredCalls": 1,
        "averageJitterMs": 1.5,
        "averageRttMs": 2.5,
        "packetsLost": 0,
    },
    "appQuality": {
        "measuredCalls": 1,
        "averageJitterMs": None,
        "averageRttMs": None,
        "packetLossRate": None,
        "reconnects": None,
    },
    "endReasons": [{"code": "user_hangup", "count": 1}],
    "appErrors": [{"code": "other", "count": 1}],
    "transports": [{"code": "socket", "count": 1}],
    "multiParticipantCalls": 0,
    "followUp": {
        "eligibleMissed": 1,
        "returnedWithin24h": 0,
        "rate": 0.0,
        "averageDelayMs": None,
        "pendingWindow": 1,
        "unknownContact": 0,
    },
}
SEGMENT = {
    "dimension": "message_type",
    "key": "text",
    "sendAttempts": 2,
    "sent": 1,
    "sendFailures": 1,
    "sendFailureRate": 0.5,
    "completedConversations": 1,
    "deliveredConversations": 1,
    "readConversations": 1,
    "repliedConversations": 1,
    "deliveryRate": 1.0,
    "readRate": 1.0,
    "replyRate": 1.0,
    "averageCustomerReplyMs": 1.5,
    "readRateInterval95": [0.2, 1.0],
    "replyRateInterval95": [0.2, 1.0],
    "readRateDifference": None,
    "replyRateDifference": None,
    "shareOfConversations": 1.0,
    "shareOfSends": 1.0,
}
ENGAGEMENT = {
    "windowHours": 24,
    "completedConversations": 1,
    "deliveredConversations": 1,
    "readConversations": 1,
    "repliedConversations": 1,
    "deliveryRate": 1.0,
    "readRate": 1.0,
    "replyRate": 1.0,
    "averageCustomerReplyMs": 1.5,
    "complete": True,
    "droppedConversations": 0,
    "droppedRecords": 0,
    "droppedReceiptJoins": 0,
}
DEVICES = {
    "detector": "message_id_prefix/v1",
    "measured": True,
    "complete": True,
    "observedBuckets": 1,
    "customerMessages": 1,
    "accountMessages": 1,
    "customerPlatforms": [{"platform": "android", "messages": 1, "share": 1.0}],
    "accountPlatforms": [{"platform": "web", "messages": 1, "share": 1.0}],
    "inventory": {
        "listObserved": True,
        "listCurrent": True,
        "observedAt": 1,
        "deviceCount": 1,
        "truncated": False,
        "devices": [
            {
                "deviceIndex": 1,
                "estimatedPlatform": "web",
                "reportedClass": "browser",
                "lastActiveAt": 1,
                "listed": True,
            }
        ],
    },
}
RECIPIENT = {
    "measured": True,
    "complete": True,
    "observedBuckets": 1,
    "droppedSignals": 0,
    "truncated": False,
    "rows": [
        {
            "ts": 1,
            "recipientCountry": "BR",
            "recipientDeviceCount": "one_linked",
            "deviceSource": "linked",
            "incomingMessages": 1,
            "deliveryReceipts": 1,
            "readReceipts": 1,
            "onlineSignals": 1,
            "offlineSignals": 1,
            "typingSignals": 1,
            "lastSignalAt": 1,
            "quietGaps": 1,
            "quietGapMs": 1.5,
            "averageQuietGapMs": 1.5,
        }
    ],
}
BREAKDOWN = {
    "measured": True,
    "complete": True,
    "observedBuckets": 1,
    "droppedConversations": 0,
    "truncated": False,
    "buckets": [{"ts": 1, "complete": True}],
    "rows": [
        {
            "recipientCountry": "BR",
            "recipientDeviceCount": "one_linked",
            "ts": 1,
            "messageType": "text",
            "textBand": "short",
            "origin": "api",
            "callingCode": "55",
            "customerDevices": "multiple",
            "completedConversations": 1,
            "deliveredConversations": 1,
            "readConversations": 1,
            "repliedConversations": 1,
            "replyLatencySumMs": 1.5,
            "readRate": 1.0,
            "replyRate": 1.0,
            "averageCustomerReplyMs": 1.5,
        }
    ],
}
ACCOUNT = {
    "observed": True,
    "primaryPhoneActivitySignals": 1,
    "primaryPhoneActivePeriods": 1,
    "completedPhoneActivityPeriods": 1,
    "phoneActivityMs": 1.5,
    "averagePhoneActivityMs": 1.5,
    "phoneQuietGaps": 1,
    "phoneQuietMs": 1.5,
    "averagePhoneQuietMs": 1.5,
    "primaryPhoneMessages": 1,
    "otherDeviceMessages": 1,
    "primaryPhoneReplies": 1,
    "otherDeviceReplies": 1,
    "averagePrimaryPhoneResponseMs": 1.5,
    "averageOtherDeviceResponseMs": 1.5,
    "lastPrimaryPhoneAt": 1,
}
METRICS = {
    "recipientActivity": RECIPIENT,
    "deviceAnalytics": DEVICES,
    "conversationBreakdown": BREAKDOWN,
    "calls": CALLBUSINESS,
    "measured": True,
    "observedHours": 1,
    "lastObservedAt": 1,
    "outgoingMessages": 1,
    "incomingMessages": 1,
    "sendAttempts": 2,
    "sendFailures": 1,
    "sendFailureRate": 0.5,
    "businessReplies": 1,
    "averageBusinessResponseMs": 1.5,
    "onlineMs": 1.5,
    "disconnects": 0,
    "connectFailures": 0,
    "streamErrors": 0,
    "keepaliveTimeouts": 0,
    "engagement": ENGAGEMENT,
    "messageAnalysis": {"complete": True, "segments": [SEGMENT]},
    "customerActivity": {
        "observed": True,
        "onlineSignals": 1,
        "offlineSignals": 1,
        "typingSignals": 1,
    },
    "accountActivity": ACCOUNT,
    "responseQueue": {
        "awaitingReply": 1,
        "oldestWaitingMs": 1.5,
        "observedAt": 1,
        "complete": True,
    },
}
SERIES = {
    "customerOnlineSignals": 1,
    "customerTypingSignals": 1,
    "primaryPhoneMessages": 1,
    "otherDeviceMessages": 1,
    "primaryPhoneReplies": 1,
    "phoneActivePeriods": 1,
    "completedPhoneActivityPeriods": 1,
    "phoneActivityMs": 1.5,
    "phoneQuietGaps": 1,
    "phoneQuietMs": 1.5,
    "sessionId": SESSION,
    "ts": 1,
    "outgoingMessages": 1,
    "incomingMessages": 1,
    "sendFailures": 1,
    "businessReplies": 1,
    "averageBusinessResponseMs": 1.5,
    "onlineMs": 1.5,
    "disconnects": 0,
}
ANALYTICS = {
    "callSeries": [{**CALL, "sessionId": SESSION, "ts": 1}],
    "enabled": True,
    "period": {"start": 0, "end": 1},
    "requestVitals": {"requests": 2, "failures": 1, "errorRate": 0.5},
    "summary": {
        **METRICS,
        "deviceAnalytics": {**DEVICES, "inventory": None},
        "totalNumbers": 1,
        "measuredNumbers": 1,
        "connectedNumbers": 1,
    },
    "numbers": [
        {
            **METRICS,
            "sessionId": SESSION,
            "projectId": PROJECT,
            "projectName": "Support",
            "name": "support",
            "backend": "linked_device",
            "status": "CONNECTED",
        }
    ],
    "series": [SERIES],
    "future": True,
}
PROMETHEUS = "# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled 1\n"


@pytest.mark.parametrize("scope", ["organization", "project", "project_token"])
@pytest.mark.parametrize("method", ["get", "metrics"])
async def test_public_analytics_methods_full_typed_response_and_bound_route(scope, method):
    project = scope != "organization"
    path = f"/platform/projects/{PROJECT}/analytics" if project else "/platform/analytics"
    params = (
        {"projectId": PROJECT.upper(), "sessionId": SESSION, "start": 0, "end": 1}
        if method == "get"
        else {
            "projectId": PROJECT.upper(),
            "sessionId": SESSION,
            "windowHours": 24,
            "segments": True,
            "format": "openmetrics",
        }
    )

    def handler(request):
        assert request.method == "GET" and request.url.path == path + (
            "/metrics" if method == "metrics" else ""
        )
        query = {
            key: ("true" if value is True else str(value))
            for key, value in params.items()
            if key != "projectId" or not project
        }
        assert dict(request.url.params) == query and request.headers["x-proof"] == "analytics"
        if method == "metrics":
            assert request.headers["accept"] == "application/openmetrics-text"
            return httpx.Response(
                200,
                text=PROMETHEUS + "# EOF\n",
                headers={
                    "content-type": "application/openmetrics-text; version=1.0.0",
                    "x-request-id": "req_analytics",
                },
            )
        return httpx.Response(
            200, json={"data": ANALYTICS}, headers={"x-request-id": "req_analytics"}
        )

    credential = (
        Credential("project_token", "pmfa_pt_" + "a" * 93 + "A")
        if scope == "project_token"
        else Credential("organization_api_key", "pmfa_" + "a" * 72)
    )
    cls = AsyncProjectClient if scope == "project_token" else AsyncClient
    args = (credential, PROJECT) if scope == "project_token" else (credential,)
    async with cls(*args, http_transport=httpx.MockTransport(handler)) as client:
        target = client.project(PROJECT) if scope == "project" else client
        response = await getattr(target.analytics, method)(
            params, options=RequestOptions(headers={"x-proof": "analytics"})
        )
        assert (
            response.data == (ANALYTICS if method == "get" else PROMETHEUS + "# EOF\n")
            and response.metadata.request_id == "req_analytics"
        )


async def test_analytics_disabled_response_and_default_prometheus_format():
    def handler(request):
        if request.url.path.endswith("/metrics"):
            assert (
                dict(request.url.params) == {"format": "prometheus"}
                and request.headers["accept"] == "text/plain"
            )
            return httpx.Response(
                200, text=PROMETHEUS.replace(" 1", " 0"), headers={"content-type": "text/plain"}
            )
        return httpx.Response(
            200,
            json={
                "data": {
                    "enabled": False,
                    "period": {"start": 0, "end": 1},
                    "requestVitals": {"requests": 0, "failures": 0, "errorRate": None},
                    "summary": None,
                    "numbers": [],
                    "series": [],
                    "callSeries": [],
                }
            },
        )

    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(handler),
    ) as client:
        assert (await client.analytics.get()).data["summary"] is None
        assert (await client.analytics.metrics()).data.endswith(" 0\n")


@pytest.mark.parametrize(
    "params",
    [
        {"windowHours": 0},
        {"windowHours": 169},
        {"windowHours": True},
        {"windowHours": 1.5},
        {"segments": "yes"},
        {"format": "json"},
        {"sessionId": "bad"},
    ],
)
async def test_metrics_invalid_controls_fail_before_request(params):
    seen = []
    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(lambda r: seen.append(r)),
    ) as client:
        with pytest.raises(ValidationError):
            await client.analytics.metrics(params)
    assert not seen


@pytest.mark.parametrize(
    "params",
    [
        {"projectId": "bad"},
        {"sessionId": "bad"},
        {"start": -1},
        {"start": True},
        {"end": 1.5},
        {"start": 9007199254740992},
        {"start": 2, "end": 1},
        {"start": 0, "end": 367 * 86400000},
    ],
)
async def test_analytics_invalid_filters_ranges_and_bound_project(params):
    seen = []
    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(lambda r: seen.append(r)),
    ) as client:
        with pytest.raises(ValidationError):
            await client.analytics.get(params)
        with pytest.raises(ValidationError):
            await client.project(PROJECT).analytics.get({"projectId": SESSION})
    assert not seen


@pytest.mark.parametrize(
    "format,body,content_type",
    [
        ("prometheus", "not a metric", "text/plain"),
        ("prometheus", PROMETHEUS, "text/html"),
        ("openmetrics", PROMETHEUS, "application/openmetrics-text"),
    ],
)
async def test_metrics_invalid_body_and_content_type_keep_metadata(format, body, content_type):
    async with AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        http_transport=httpx.MockTransport(
            lambda r: httpx.Response(
                200,
                text=body,
                headers={"content-type": content_type, "x-request-id": "req_invalid"},
            )
        ),
    ) as client:
        with pytest.raises(ServerError) as caught:
            await client.analytics.metrics({"format": format})
        assert (
            caught.value.code == "invalid_response"
            and caught.value.metadata.request_id == "req_invalid"
        )
