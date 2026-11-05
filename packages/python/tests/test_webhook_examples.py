"""Exercise the shipped framework views with original, signed HTTP bodies."""

import importlib.util
from pathlib import Path

import httpx
from django.conf import settings
from django.test import RequestFactory

from polymorfa import create_webhook_fixture

EXAMPLES = Path(__file__).resolve().parents[3] / "examples/python"
SECRET = "example-secret"


def load_example(name):
    spec = importlib.util.spec_from_file_location(name, EXAMPLES / f"{name}.py")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def fixture(event="message.received"):
    return create_webhook_fixture(
        {
            "id": "event_example",
            "session": "support",
            "timestamp": "2026-10-11T00:00:00Z",
            "event": event,
            "payload": {
                "id": "message_example",
                "whatsapp_ids": {"linked_devices": "WA_1"},
                "conversation": {"id": "1555"},
                "fromMe": False,
                "timestamp": 1234,
                "pushName": "Example",
                "isGroup": False,
                "type": "text",
                "text": "Hello",
            },
        },
        SECRET,
    )


async def test_shipped_fastapi_view_verification_known_narrowing_and_unknown(monkeypatch):
    monkeypatch.setenv("POLYMORFA_WEBHOOK_SECRET", SECRET)
    example = load_example("fastapi_webhook")
    signed = fixture()
    async with httpx.AsyncClient(
        transport=httpx.ASGITransport(app=example.app), base_url="http://example.test"
    ) as client:
        response = await client.post(
            "/webhooks/polymorfa", content=signed.body, headers=signed.headers
        )
        assert response.status_code == 200
        assert response.json() == {"received": "event_example", "message": "message_example"}
        tampered = await client.post(
            "/webhooks/polymorfa", content=signed.body + b" ", headers=signed.headers
        )
        assert tampered.status_code == 400
        assert tampered.json() == {"error": "invalid_signature"}
        future = fixture("future.event")
        response = await client.post(
            "/webhooks/polymorfa", content=future.body, headers=future.headers
        )
        assert response.json() == {"received": "event_example"}


def test_shipped_django_view_original_bytes_and_method_guard(monkeypatch):
    monkeypatch.setenv("POLYMORFA_WEBHOOK_SECRET", SECRET)
    if not settings.configured:
        settings.configure(DEFAULT_CHARSET="utf-8")
    example, requests, signed = load_example("django_webhook"), RequestFactory(), fixture()
    response = example.webhook(
        requests.post(
            "/webhooks/polymorfa",
            data=signed.body,
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=signed.signature,
        )
    )
    assert response.status_code == 200
    assert b'"message": "message_example"' in response.content
    invalid = example.webhook(
        requests.post(
            "/webhooks/polymorfa",
            data=signed.body + b" ",
            content_type="application/json",
            HTTP_X_WEBHOOK_SIGNATURE=signed.signature,
        )
    )
    assert invalid.status_code == 400
    assert example.webhook(requests.get("/webhooks/polymorfa")).status_code == 405
