package polymorfa

import (
	"encoding/json"
	"testing"
)

func TestStatusPublicationPayloadHasSharedContentAndSeparateScope(t *testing.T) {
	var payload StatusPublicationPayload
	if err := json.Unmarshal([]byte(`{"id":"123","whatsapp_ids":{"linked_devices":"authored-status"},"scope":"group","publisher":{"id":"456"},"group":{"id":"789"},"fromMe":false,"timestamp":1700000000,"pushName":"Authored","content":{"type":"text","text":"publication","futureMediaField":123}}`), &payload); err != nil {
		t.Fatal(err)
	}
	if payload.Scope != StatusGroup || payload.Group.ID != "789" || payload.Content.Text != "publication" {
		t.Fatalf("wrong typed publication: %#v", payload)
	}
	body, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var fields map[string]json.RawMessage
	if err := json.Unmarshal(body, &fields); err != nil {
		t.Fatal(err)
	}
	var content map[string]any
	if err := json.Unmarshal(fields["content"], &content); err != nil {
		t.Fatal(err)
	}
	if content["futureMediaField"] != float64(123) {
		t.Fatal("lost forward content metadata")
	}
	if _, exists := fields["conversation"]; exists {
		t.Fatal("status has a chat conversation")
	}
}

func TestSignalStatusEventDoesNotFallBackToMessage(t *testing.T) {
	event, err := parseSignalEvent([]byte(`{"id":"authored-status-event","type":"status.received","status_scope":"personal","session_id":"authored-session","chat":"status@broadcast","sender":"123@s.whatsapp.net","message_id":"authored-publication","timestamp":1700000000,"is_from_me":false,"redelivered":false,"identity_changed":false,"message_proto":"CgdmaXh0dXJl","text":"authored publication"}`))
	if err != nil {
		t.Fatal(err)
	}
	if event.Type != "status.received" || event.StatusScope == nil || *event.StatusScope != StatusPersonal {
		t.Fatal("remote status classification was lost")
	}
}

func TestLinkedMessageLiteralStillBuildsWithOwnedFields(t *testing.T) {
	payload := LinkedDeviceMessagePayload{Type: "text", Text: "authored legacy construction"}
	encoded, err := json.Marshal(payload)
	if err != nil {
		t.Fatal(err)
	}
	var decoded LinkedDeviceMessagePayload
	if err := json.Unmarshal(encoded, &decoded); err != nil {
		t.Fatal(err)
	}
	if decoded.Type != payload.Type || decoded.Text != payload.Text {
		t.Fatal("message construction changed")
	}
}
