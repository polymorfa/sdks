package polymorfa

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"os"
	"testing"
)

func TestCampaignWebhookMetadata(t *testing.T) {
	var fixture struct {
		Secret  string
		BatchID string
		Events  []json.RawMessage
	}
	data, err := os.ReadFile("../../contracts/fixtures/campaign-webhook-metadata.json")
	if err != nil {
		t.Fatal(err)
	}
	if err = json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	signed := func(raw []byte) (VerifiedWebhookDelivery, error) {
		mac := hmac.New(sha256.New, []byte(fixture.Secret))
		mac.Write(raw)
		return ConstructWebhookDelivery(raw, hex.EncodeToString(mac.Sum(nil)), fixture.Secret)
	}
	check := func(event WebhookEvent, index int) {
		t.Helper()
		var expected WebhookEvent
		if err := json.Unmarshal(fixture.Events[index], &expected); err != nil {
			t.Fatal(err)
		}
		actualRaw, expectedRaw := new(bytes.Buffer), new(bytes.Buffer)
		if json.Compact(actualRaw, event.Payload) != nil || json.Compact(expectedRaw, expected.Payload) != nil || event.ID != expected.ID || !bytes.Equal(actualRaw.Bytes(), expectedRaw.Bytes()) {
			t.Fatal("raw payload/order changed")
		}
		payload, known, err := event.TypedPayload()
		if err != nil || !known {
			t.Fatal(payload, known, err)
		}
		switch p := payload.(type) {
		case *CampaignPausedPayload:
			if p.PausedAt != 1757161200 {
				t.Fatal("pause seconds changed")
			}
			if index == 0 {
				if p.Reason == nil || *p.Reason != "Automatic safety pause" || p.Code == nil || *p.Code != "future_automatic_pause" {
					t.Fatal("automatic metadata lost")
				}
			} else if p.Reason != nil || p.Code != nil {
				t.Fatal("manual pause gained fields")
			}
		case *CampaignRecipientSkippedPayload:
			if p.SkippedAt != 1757161200000 {
				t.Fatal("skip milliseconds changed")
			}
			if index == 2 && (p.MessageIndex == nil || *p.MessageIndex != 0 || p.FollowUpID != nil) {
				t.Fatal("zero index/omission lost")
			}
			if index == 3 && (p.MessageIndex == nil || *p.MessageIndex != 1 || p.FollowUpID == nil || *p.FollowUpID != "0198a2cb-0000-7000-8000-0000000000f1") {
				t.Fatal("follow-up metadata lost")
			}
			if index == 4 && (p.MessageIndex != nil || p.FollowUpID != nil || p.Reason != "future_skip_reason") {
				t.Fatal("optional/future reason changed")
			}
		default:
			t.Fatalf("wrong public payload %T", p)
		}
		encoded, err := json.Marshal(payload)
		if err != nil {
			t.Fatal(err)
		}
		var fields map[string]json.RawMessage
		json.Unmarshal(encoded, &fields)
		if index == 1 && (fields["code"] != nil || fields["reason"] != nil) {
			t.Fatal("manual omitted fields serialized")
		}
		if index == 4 && (fields["messageIndex"] != nil || fields["followUpId"] != nil) {
			t.Fatal("skip omitted fields serialized")
		}
	}
	for i, raw := range fixture.Events {
		delivery, err := signed(raw)
		if err != nil || delivery.Event == nil {
			t.Fatal(delivery, err)
		}
		check(*delivery.Event, i)
	}
	raw, err := json.Marshal(map[string]any{"object": "event_batch", "version": 1, "id": fixture.BatchID, "events": fixture.Events})
	if err != nil {
		t.Fatal(err)
	}
	delivery, err := signed(raw)
	if err != nil || delivery.Batch == nil || len(delivery.Batch.Events) != 5 {
		t.Fatal(delivery, err)
	}
	for i, event := range delivery.Batch.Events {
		check(event, i)
	}
	for _, invalid := range []struct {
		index    int
		old, bad string
	}{{0, `"code":"future_automatic_pause"`, `"code":[]`}, {2, `"messageIndex":0`, `"messageIndex":"zero"`}, {3, `"followUpId":"0198a2cb-0000-7000-8000-0000000000f1"`, `"followUpId":42`}} {
		compact := new(bytes.Buffer)
		if err := json.Compact(compact, fixture.Events[invalid.index]); err != nil {
			t.Fatal(err)
		}
		bad := bytes.Replace(compact.Bytes(), []byte(invalid.old), []byte(invalid.bad), 1)
		if bytes.Equal(bad, compact.Bytes()) {
			t.Fatal("invalid control was vacuous")
		}
		value, err := signed(bad)
		if err != nil {
			t.Fatal(err)
		} // Envelope policy stays tolerant.
		if _, known, err := value.Event.TypedPayload(); !known || err == nil {
			t.Fatal("malformed typed metadata accepted")
		}
		if _, err := ConstructWebhookDelivery(bad, "bad", fixture.Secret); err == nil {
			t.Fatal("signature must fail first")
		}
	}
}
