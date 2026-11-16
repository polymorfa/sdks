import json

from polymorfa.signal_node import SignalNodeEvent


def test_remote_status_keeps_scope_without_becoming_a_message() -> None:
    event = SignalNodeEvent.from_wire(
        json.loads(
            '{"id":"authored-status-event","type":"status.received","status_scope":"personal","session_id":"authored-session","chat":"status@broadcast","sender":"123@s.whatsapp.net","message_id":"authored-publication","timestamp":1700000000,"is_from_me":false,"redelivered":false,"identity_changed":false,"message_proto":"CgdmaXh0dXJl","text":"authored publication"}'
        )
    )
    assert event.type == "status.received"
    assert event.status_scope == "personal"
    assert event.chat == "status@broadcast"
