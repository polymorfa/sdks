import base64
import hashlib
import hmac

import pytest

from polymorfa import (
    ValidationError,
    WebhookSignatureError,
    construct_local_webhook_event,
    construct_webhook_event,
    create_webhook_fixture,
    verify_local_webhook_signature,
)

EVENT = {
    "id": "event_1",
    "session": "",
    "timestamp": "2026-10-11T00:00:00Z",
    "event": "future.event",
    "payload": {"text": "héllo", "future": [1, False, None]},
}
KEY = bytes(range(32))
SECRET = base64.urlsafe_b64encode(KEY).decode().rstrip("=")


def signature(body, timestamp=1234):
    digest = hmac.new(KEY, str(timestamp).encode() + b"." + body, hashlib.sha256).hexdigest()
    return f"t={timestamp},v1={digest}"


def test_local_forward_verifies_original_bytes_timestamp_and_distinct_key_encoding():
    fixture = create_webhook_fixture(EVENT, "native-secret")
    local = signature(fixture.body)
    assert verify_local_webhook_signature(fixture.body, local, SECRET, now_unix_seconds=1234)
    event = construct_local_webhook_event(fixture.body, local, SECRET, now_unix_seconds=1534)
    assert event.raw == EVENT and not event.known
    assert not verify_local_webhook_signature(
        fixture.body + b" ", local, SECRET, now_unix_seconds=1234
    )
    assert not verify_local_webhook_signature(
        fixture.body, local, "native-secret", now_unix_seconds=1234
    )
    assert not verify_local_webhook_signature(fixture.body, local, SECRET, now_unix_seconds=1535)
    assert not verify_local_webhook_signature(fixture.body, local, SECRET, now_unix_seconds=933)
    assert construct_webhook_event(fixture.body, fixture.signature, "native-secret").raw == EVENT
    assert fixture.headers == {
        "content-type": "application/json",
        "x-webhook-signature": fixture.signature,
    }
    with pytest.raises(TypeError):
        fixture.headers["x-webhook-signature"] = "changed"


@pytest.mark.parametrize(
    "local",
    [
        "t=1234,v1=" + "A" * 64,
        "t=-1,v1=" + "a" * 64,
        "t=9007199254740992,v1=" + "a" * 64,
        "v1=" + "a" * 64,
        "t=1234, v1=" + "a" * 64,
        "sha256=" + "a" * 64,
    ],
)
def test_local_malformed_signature(local):
    with pytest.raises(WebhookSignatureError):
        construct_local_webhook_event(b"{}", local, SECRET, now_unix_seconds=1234)


@pytest.mark.parametrize("tolerance", [-1, 0.5, True, 9007199254740992])
def test_invalid_tolerance(tolerance):
    assert not verify_local_webhook_signature(
        b"{}", signature(b"{}"), SECRET, tolerance_seconds=tolerance, now_unix_seconds=1234
    )


@pytest.mark.parametrize(
    "body,code",
    [
        (b"\xff", "invalid_webhook_body"),
        (
            b'{"id":"x","session":"","event":"future","timestamp":"now","payload":NaN}',
            "invalid_webhook_json",
        ),
        (b"{}", "invalid_webhook_event"),
    ],
)
def test_signature_precedes_utf8_json_and_envelope_errors(body, code):
    signed = hmac.new(b"secret", body, hashlib.sha256).hexdigest()
    with pytest.raises(ValidationError) as invalid:
        construct_webhook_event(body, signed, "secret")
    assert invalid.value.code == code
    with pytest.raises(WebhookSignatureError):
        construct_webhook_event(body, "0" * 64, "secret")
