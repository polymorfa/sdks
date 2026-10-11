"""Actual TCP request/response evidence for every BanSafe observation method."""

import asyncio
import json
from typing import get_type_hints
from urllib.parse import parse_qs, urlsplit

import pytest

from polymorfa import AsyncClient
from polymorfa.bansafe_observations import (
    Claim,
    HealthAction,
    HealthPoint,
    HealthProjection,
    NumberDetail,
    Signal,
)
from polymorfa.transport import Credential, RequestOptions

HEALTH = {
    "health": 91.5,
    "band": "good",
    "healthSource": "ml_model",
    "healthEstimatorVersion": "rules1",
    "healthModelVersion": "model1",
    "healthEvaluatedAt": "now",
    "healthFeatureCoverage": 0.9,
    "healthReliability": "validated",
    "healthUnavailableReason": None,
    "healthProbabilities": {"healthy": 0.9, "limited": 0.08, "restricted": 0.01, "banned": 0.01},
    "mostLikelyHealthState": "healthy",
    "healthExplanation": {
        "penalties": {
            "conduct": 1.0,
            "delivery": 2.0,
            "connection": 0.0,
            "restriction": 0.0,
            "total": 3.0,
        },
        "factors": [
            {
                "group": "delivery",
                "key": "failed",
                "penalty": 2.0,
                "observedValue": 0.1,
                "sampleSize": 20,
            }
        ],
        "measuredGroups": ["delivery", "connection"],
        "missingGroups": ["conduct"],
    },
    "observedAccountState": {"state": "healthy", "observedAt": "now", "source": "account_check"},
}
ENFORCEMENT = {
    "rung": "notify",
    "previousRung": "none",
    "organizationFloor": "none",
    "reason": "health",
    "source": "automatic",
    "throughputPerMinute": 10.0,
    "blocksUnsolicited": False,
    "suspended": False,
    "startedAt": "now",
    "eligibleLiftAt": None,
    "exitProgress": 0.5,
    "blockingFindings": ["delivery"],
    "operatorHold": False,
    "appealState": "none",
    "state": "applied",
}
NUMBER = {
    **HEALTH,
    "sessionId": "sid",
    "session": "support",
    "phoneNumber": "+1555",
    "projectId": "project",
    "enforcement": ENFORCEMENT,
}
FINDING = {
    "id": "finding",
    "key": "delivery",
    "title": "Delivery",
    "summary": "Check delivery",
    "fix": "Slow down",
    "status": "open",
    "severity": "warning",
    "occurrences": 2,
    "reopenedCount": 1,
    "evidence": {"failed": 0.1},
    "sessionId": "sid",
    "session": "support",
    "phoneNumber": "+1555",
    "firstSeenAt": "then",
    "lastSeenAt": "now",
    "acknowledgedAt": None,
    "acknowledgedBy": None,
    "acknowledgementNote": None,
    "snoozedUntil": None,
    "resolvedAt": None,
    "resolveReason": None,
}
DETAIL = {
    **NUMBER,
    "warmup": {
        "enabled": True,
        "tenureSource": "history",
        "tenureDay": 5,
        "allowance": 10,
        "sentToday": 2,
        "resetsAt": "later",
        "curve": [{"day": 1, "allowance": 5}],
    },
    "findings": [FINDING],
    "liftRequires": "clean",
    "appealState": "requested",
}
INCIDENT = {
    "id": "incident",
    "sessionId": "sid",
    "session": "support",
    "phoneNumber": "+1555",
    "projectId": "project",
    "kind": "customer_report",
    "source": "customer",
    "resolution": "open",
    "ambiguous": True,
    "startedAt": "now",
    "endsAt": None,
    "closedAt": None,
    "closedBy": None,
    "claimId": "claim",
    "note": "reported",
    "reportedBy": "member",
    "createdAt": "now",
}
CLAIM = {
    "id": "claim",
    "incidentId": "incident",
    "sessionId": "sid",
    "session": "support",
    "phoneNumber": "+1555",
    "projectId": "project",
    "status": "under_review",
    "verdict": "inconclusive",
    "windowStart": "then",
    "windowEnd": "now",
    "measuredCents": 2.123456,
    "capCents": 3.123456,
    "amountCents": 0.123456,
    "evidence": {
        "attributionRuleVersion": 1,
        "windowDays": 7,
        "deviceEvidence": True,
        "otherDevices": 2,
        "restrictedInWindow": True,
        "criticalFindingDays": 1,
        "sharedConnection": False,
        "measuredHours": 100,
    },
    "summary": "Review",
    "reason": "evidence",
    "decidedAt": None,
    "paidAt": None,
    "createdAt": "now",
}
SIGNAL = {
    "key": "delivery",
    "label": "Delivery",
    "group": "delivery",
    "kind": "code_counts",
    "unit": "count",
    "description": "Codes",
    "measured": True,
    "value": [1.0, 2.0],
    "sampleSize": 2,
    "codes": [{"code": 429, "count": 2}],
}
SNAPSHOT = {
    "bucketStart": "then",
    "flushedAt": "now",
    "receivedAt": "now",
    "partial": False,
    "recordVersion": 2,
    "signals": [SIGNAL],
}
COLLECTION = {
    "sessionId": "sid",
    "session": "support",
    "projectId": "project",
    "collection": {
        "state": "fresh",
        "latestFlushedAt": "now",
        "latestReceivedAt": "now",
        "freshUntil": "later",
        "recordVersion": 2,
        "collectorVersion": 1,
        "partial": False,
        "droppedRecords": 0,
    },
}
ACTION = {
    "id": "action",
    "sessionId": "sid",
    "session": "support",
    "projectId": "project",
    "mode": "apply",
    "action": "slow_down",
    "status": "succeeded",
    "health": 51.0,
    "threshold": 55.0,
    "healthSource": "rules_v1",
    "estimatorVersion": "rules1",
    "modelVersion": None,
    "slowDownMps": 1.0,
    "evaluatedAt": "then",
    "createdAt": "then",
    "completedAt": "now",
    "outcome": "applied",
}


def page(item):
    return {"data": [item], "page": {"nextCursor": "next", "hasMore": True}, "future": True}


BASE = "/platform/bansafe"
CASES = [
    (
        "list_health",
        "GET",
        BASE + "/health",
        None,
        {"projectId": "project", "cursor": "before", "limit": "5"},
        page(NUMBER),
        lambda r, o: r.list_health(
            {"projectId": "project", "cursor": "before", "limit": 5}, options=o
        ),
    ),
    (
        "get_health",
        "GET",
        BASE + "/health/support",
        None,
        {},
        {"data": DETAIL},
        lambda r, o: r.get_health("support", options=o),
    ),
    (
        "list_health_history",
        "GET",
        BASE + "/health/support/history",
        None,
        {"since": "then", "limit": "5"},
        {"data": {"sessionId": "sid", "session": "support", "points": [{**HEALTH, "band": None}]}},
        lambda r, o: r.list_health_history("support", {"since": "then", "limit": 5}, options=o),
    ),
    (
        "list_signals",
        "GET",
        BASE + "/signals",
        None,
        {},
        {
            "data": [
                {
                    k: v
                    for k, v in SIGNAL.items()
                    if k in ("key", "label", "group", "kind", "unit", "description")
                }
            ]
        },
        lambda r, o: r.list_signals(options=o),
    ),
    (
        "get_telemetry",
        "GET",
        BASE + "/telemetry/support",
        None,
        {},
        {"data": {**COLLECTION, "snapshot": SNAPSHOT}},
        lambda r, o: r.get_telemetry("support", options=o),
    ),
    (
        "list_telemetry_history",
        "GET",
        BASE + "/telemetry/support/history",
        None,
        {"since": "then", "until": "now", "cursor": "before", "limit": "5"},
        page(SNAPSHOT),
        lambda r, o: r.list_telemetry_history(
            "support", {"since": "then", "until": "now", "cursor": "before", "limit": 5}, options=o
        ),
    ),
    (
        "list_collection",
        "GET",
        BASE + "/collection",
        None,
        {"projectId": "project"},
        page(COLLECTION),
        lambda r, o: r.list_collection({"projectId": "project"}, options=o),
    ),
    (
        "list_health_actions",
        "GET",
        BASE + "/health-actions",
        None,
        {"session": "support", "status": "succeeded"},
        page(ACTION),
        lambda r, o: r.list_health_actions(
            {"session": "support", "status": "succeeded"}, options=o
        ),
    ),
    (
        "list_findings",
        "GET",
        BASE + "/findings",
        None,
        {"severity": "warning", "status": "open"},
        page(FINDING),
        lambda r, o: r.list_findings({"severity": "warning", "status": "open"}, options=o),
    ),
    (
        "list_enforcement",
        "GET",
        BASE + "/enforcement",
        None,
        {"rung": "notify"},
        page(
            {
                **NUMBER,
                **{k: v for k, v in ENFORCEMENT.items() if k != "exitProgress"},
                "liftRequires": "clean",
            }
        ),
        lambda r, o: r.list_enforcement({"rung": "notify"}, options=o),
    ),
    (
        "list_incidents",
        "GET",
        BASE + "/incidents",
        None,
        {"session": "support"},
        page(INCIDENT),
        lambda r, o: r.list_incidents({"session": "support"}, options=o),
    ),
    (
        "create_incident",
        "POST",
        BASE + "/incidents",
        {"session": "support", "occurredAt": "now", "note": "reported"},
        {},
        {
            "data": {
                "incidentId": "incident",
                "created": True,
                "sessionId": "sid",
                "session": "support",
                "occurredAt": "now",
            }
        },
        lambda r, o: r.create_incident(
            {"session": "support", "occurredAt": "now", "note": "reported"}, options=o
        ),
    ),
    (
        "retract_incident",
        "POST",
        BASE + "/incidents/incident%2F1/retract",
        None,
        {},
        {"data": INCIDENT},
        lambda r, o: r.retract_incident("incident/1", options=o),
    ),
    (
        "list_claims",
        "GET",
        BASE + "/claims",
        None,
        {"status": "under_review"},
        page(CLAIM),
        lambda r, o: r.list_claims({"status": "under_review"}, options=o),
    ),
    (
        "get_claim",
        "GET",
        BASE + "/claims/claim%2F1",
        None,
        {},
        {"data": CLAIM},
        lambda r, o: r.get_claim("claim/1", options=o),
    ),
]


@pytest.mark.parametrize(
    "name,method,path,body,query,payload,invoke", CASES, ids=[c[0] for c in CASES]
)
async def test_bansafe_observation_native_wire(name, method, path, body, query, payload, invoke):
    result = asyncio.get_running_loop().create_future()

    async def serve(reader, writer):
        try:
            head = await reader.readuntil(b"\r\n\r\n")
            lines = head.decode().split("\r\n")
            got_method, target, _ = lines[0].split(" ")
            headers = {
                k.lower(): v.strip()
                for k, v in (line.split(":", 1) for line in lines[1:] if ":" in line)
            }
            raw = await reader.readexactly(int(headers.get("content-length", "0")))
            assert got_method == method and urlsplit(target).path == path
            assert {k: v[0] for k, v in parse_qs(urlsplit(target).query).items()} == query
            assert (json.loads(raw) if raw else None) == body
            assert headers["authorization"] == "Bearer pmfa_" + "a" * 72
            assert headers["polymorfa-version"] == "2026-09-22"
            assert headers["idempotency-key"] == "proof-key"
            encoded = json.dumps(payload).encode()
            writer.write(
                f"HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: {len(encoded)}\r\nX-Request-ID: bansafe-native\r\nConnection: close\r\n\r\n".encode()
                + encoded
            )
            await writer.drain()
            result.set_result(True)
        except (AssertionError, asyncio.IncompleteReadError, ValueError, KeyError, OSError) as exc:
            result.set_exception(exc)
        finally:
            writer.close()
            await writer.wait_closed()

    server = await asyncio.start_server(serve, "127.0.0.1", 0)
    client = AsyncClient(
        Credential("organization_api_key", "pmfa_" + "a" * 72),
        base_url=f"http://127.0.0.1:{server.sockets[0].getsockname()[1]}",
        max_network_retries=0,
    )
    try:
        response = await invoke(client.ban_safe, RequestOptions(idempotency_key="proof-key"))
        assert response.data == payload
        assert response.metadata.request_id == "bansafe-native"
        assert response.metadata.attempts == 1
        await result
    finally:
        await client.close()
        server.close()
        await server.wait_closed()


def test_named_dtos_expose_nested_models_nullable_values_and_fractional_credit_quantities():
    assert set(get_type_hints(NumberDetail)) == set(DETAIL)
    assert set(get_type_hints(Claim)) == set(CLAIM)
    assert get_type_hints(Claim)["amountCents"] is float
    assert get_type_hints(HealthProjection)["band"] != get_type_hints(HealthPoint)["band"]
    assert set(get_type_hints(HealthAction)) == set(ACTION)
    assert set(get_type_hints(Signal)) == set(SIGNAL)
