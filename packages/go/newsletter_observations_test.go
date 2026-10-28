package polymorfa

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"reflect"
	"testing"
)

func TestNewsletterObservationDelivery(t *testing.T) {
	raw, err := os.ReadFile("../../contracts/fixtures/newsletter-observations/delivery.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Secret  string
		BatchID string
		Events  []json.RawMessage
	}
	if err := json.Unmarshal(raw, &fixture); err != nil {
		t.Fatal(err)
	}
	check := func(event WebhookEvent, expected json.RawMessage) {
		t.Helper()
		value, known, err := event.TypedPayload()
		if err != nil || !known {
			t.Fatalf("typed newsletter: %v %v", known, err)
		}
		typed, ok := value.(*NewsletterUpdatePayload)
		if !ok {
			t.Fatalf("payload=%T", value)
		}
		var want struct{ Payload json.RawMessage }
		if err := json.Unmarshal(expected, &want); err != nil {
			t.Fatal(err)
		}
		encoded, err := json.Marshal(typed)
		if err != nil {
			t.Fatal(err)
		}
		var a, b any
		_ = json.Unmarshal(encoded, &a)
		_ = json.Unmarshal(want.Payload, &b)
		if !reflect.DeepEqual(a, b) {
			t.Fatalf("newsletter omission/zero/map roundtrip: %s != %s", encoded, want.Payload)
		}
		if typed.Action == "live_update" {
			rows := *typed.Messages
			if rows[0].Forwards == nil || *rows[0].Forwards != 0 || rows[0].ReactionCounts == nil || len(*rows[0].ReactionCounts) != 0 || rows[1].Message != nil || rows[1].Forwards != nil {
				t.Fatal("missing/zero/empty metadata lost")
			}
		}
		if typed.Action == "milestone" && (typed.Milestone.Type != "FUTURE_MILESTONE" || typed.Milestone.Value != 0) {
			t.Fatal("milestone lost")
		}
	}
	signed := func(raw []byte) VerifiedWebhookDelivery {
		t.Helper()
		mac := hmac.New(sha256.New, []byte(fixture.Secret))
		mac.Write(raw)
		v, e := ConstructWebhookDelivery(raw, hex.EncodeToString(mac.Sum(nil)), fixture.Secret)
		if e != nil {
			t.Fatal(e)
		}
		return v
	}
	for _, expected := range fixture.Events {
		v := signed(expected)
		check(*v.Event, expected)
		roundtrip, e := CreateWebhookFixture(*v.Event, fixture.Secret)
		if e != nil {
			t.Fatal(e)
		}
		check(*signed(roundtrip.Body).Event, expected)
	}
	batch, _ := json.Marshal(map[string]any{"object": "event_batch", "version": 1, "id": fixture.BatchID, "events": fixture.Events})
	delivery := signed(batch)
	if delivery.Batch == nil || len(delivery.Batch.Events) != 3 {
		t.Fatal("batch lost")
	}
	for i, event := range delivery.Batch.Events {
		check(event, fixture.Events[i])
	}
	channelRaw, e := os.ReadFile("../../contracts/fixtures/newsletter-observations/channel-message.json")
	if e != nil {
		t.Fatal(e)
	}
	var channel ChannelMessage
	if e = json.Unmarshal(channelRaw, &channel); e != nil || channel.Forwards == nil || *channel.Forwards != 0 {
		t.Fatal("forward zero lost", e)
	}
}
