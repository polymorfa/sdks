import asyncio

import pytest

from polymorfa import AuthorizationError, CallReporter, RateLimitError, ServerError


async def test_bounded_quality_error_reports_and_clean_technical_measurements():
    seen = []
    now = [100]

    async def send(report):
        seen.append(report)

    reporter = CallReporter(
        "connection_1",
        {"sdk": "polymorfa-sdk", "version": "0.1.0.dev0", "platform": "other"},
        send,
        now=lambda: now[0],
    )
    reporter.quality(
        {
            "rttMs": 1.5,
            "jitterMs": 60001,
            "reconnects": 1001,
            "audioCodec": "opus",
            "videoCodec": "invalid secret codec",
            "packetsLost": float("nan"),
        }
    )
    reporter.quality({"rttMs": 9})
    for _ in range(21):
        reporter.error("media_timeout")
    await reporter.drain()
    assert len(seen) == 21
    assert seen[0]["quality"] == {
        "rttMs": 2,
        "jitterMs": 60000,
        "reconnects": 1000,
        "audioCodec": "opus",
    }
    now[0] += 60
    reporter.error("other")
    reporter.quality({"candidateType": "relay"})
    await reporter.drain()
    assert len(seen) == 23
    reporter.stop()
    reporter.error("other")
    reporter.quality({"rttMs": 1})
    assert len(seen) == 23


@pytest.mark.parametrize(
    "failure,stopped",
    [
        (AuthorizationError("no", status=403), True),
        (RateLimitError("later", status=429), False),
        (ServerError("later", status=503), False),
    ],
)
async def test_diagnostics_failure_does_not_escape_and_refusal_stops_future_reports(
    failure, stopped
):
    async def send(report):
        raise failure

    reporter = CallReporter(
        "connection_1", {"sdk": "polymorfa-sdk", "version": "0.1.0.dev0", "platform": "other"}, send
    )
    reporter.error("other")
    await reporter.drain()
    assert reporter.stopped is stopped
    await asyncio.sleep(0)
