import hashlib
import hmac
import json
from pathlib import Path
from typing import cast

from polymorfa import construct_webhook_delivery, create_webhook_fixture, is_event
from polymorfa.channels import ChannelMessage
from polymorfa.webhook_models import NewsletterUpdatePayload
from polymorfa.webhooks import WebhookEventBatch

FIXTURES = Path(__file__).parents[3] / "contracts/fixtures/newsletter-observations"


def test_newsletter_single_batch_and_fixture_roundtrip() -> None:
    fixture = json.loads((FIXTURES / "delivery.json").read_text())

    def signed(value: object):
        raw = json.dumps(value, ensure_ascii=False).encode()
        signature = hmac.new(fixture["secret"].encode(), raw, hashlib.sha256).hexdigest()
        return construct_webhook_delivery(raw, signature, fixture["secret"])

    batch = signed(
        {
            "object": "event_batch",
            "version": 1,
            "id": fixture["batchId"],
            "events": fixture["events"],
        }
    )
    assert isinstance(batch, WebhookEventBatch)
    for index, expected in enumerate(fixture["events"]):
        event = signed(expected)
        assert not isinstance(event, WebhookEventBatch)
        assert is_event(event, "newsletter.update")
        payload: NewsletterUpdatePayload = event.payload
        assert payload == expected["payload"] == batch.events[index].payload
        encoded = create_webhook_fixture(event, fixture["secret"])
        again = construct_webhook_delivery(encoded.body, encoded.signature, fixture["secret"])
        assert not isinstance(again, WebhookEventBatch)
        assert again.payload == payload
    live = cast(NewsletterUpdatePayload, batch.events[0].payload)
    assert live["messages"][0]["forwards"] == 0
    assert live["messages"][0]["reactionCounts"] == {}
    assert live["messages"][1] == {"position": 124}
    assert live["messages"][0]["viewCounts"] == [{"count": 0}, {"type": "views", "count": 11}]
    channel = cast(ChannelMessage, json.loads((FIXTURES / "channel-message.json").read_text()))
    assert channel["forwards"] == 0
