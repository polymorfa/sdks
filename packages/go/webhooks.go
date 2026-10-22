package polymorfa

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"unicode/utf8"
)

// WebhookEvent retains unknown payloads without coercion. Session can be empty
// on project events. The raw signed bytes must be verified before parsing.
type WebhookEvent struct {
	ID         string          `json:"id"`
	Session    string          `json:"session"`
	ExternalID string          `json:"externalId,omitempty"`
	Timestamp  string          `json:"timestamp"`
	Event      string          `json:"event"`
	Payload    json.RawMessage `json:"payload"`
}

func VerifyWebhookSignature(body []byte, signature, secret string) bool {
	if secret == "" {
		return false
	}
	sig, err := hex.DecodeString(strings.TrimPrefix(signature, "sha256="))
	if err != nil || len(sig) != sha256.Size {
		return false
	}
	m := hmac.New(sha256.New, []byte(secret))
	m.Write(body)
	return hmac.Equal(sig, m.Sum(nil))
}
func ConstructWebhookEvent(body []byte, signature, secret string) (WebhookEvent, error) {
	if !VerifyWebhookSignature(body, signature, secret) {
		return WebhookEvent{}, &Error{Kind: AuthenticationError, Code: "invalid_webhook_signature", Message: "Webhook signature verification failed."}
	}
	return ParseVerifiedWebhookEvent(body)
}
func ParseVerifiedWebhookEvent(body []byte) (WebhookEvent, error) {
	if !utf8.Valid(body) {
		return WebhookEvent{}, &Error{Kind: ValidationError, Code: "invalid_webhook_body", Message: "Webhook body must contain valid UTF-8."}
	}
	var e WebhookEvent
	var shape map[string]json.RawMessage
	if err := json.Unmarshal(body, &shape); err != nil {
		return e, &Error{Kind: ValidationError, Code: "invalid_webhook_json", Message: "Webhook body must contain valid JSON."}
	}
	if err := json.Unmarshal(body, &e); err != nil || e.ID == "" || e.Timestamp == "" || e.Event == "" || shape["session"] == nil || string(shape["session"]) == "null" || shape["payload"] == nil {
		return WebhookEvent{}, &Error{Kind: ValidationError, Code: "invalid_webhook_event", Message: "Webhook body is not a valid event envelope."}
	}
	return e, nil
}
func (e WebhookEvent) Known() bool { _, ok := knownWebhookEvents[e.Event]; return ok }

var knownWebhookEvents = map[string]struct{}{
	"bansafe.action": {}, "bansafe.claim": {}, "bansafe.health_threshold": {}, "bansafe.incident": {}, "blocklist.update": {}, "business.quick_reply.update": {},
	"call.accepted": {}, "call.connection_joined": {}, "call.connection_left": {}, "call.ended": {}, "call.missed": {}, "call.participant_joined": {}, "call.participant_left": {}, "call.participant_state": {}, "call.permission_changed": {}, "call.received": {}, "call.rejected": {}, "call.telemetry": {},
	"campaign.cap_reached": {}, "campaign.cold_blocked": {}, "campaign.completed": {}, "campaign.failed": {}, "campaign.launched": {}, "campaign.paused": {}, "campaign.recipient_failed": {}, "campaign.recipient_sent": {}, "campaign.recipient_skipped": {}, "campaign.rescheduled": {}, "campaign.resumed": {}, "campaign.stopped": {}, "campaign.throttled": {},
	"chat.archive": {}, "chat.clear": {}, "chat.delete": {}, "chat.mute": {}, "chat.read": {}, "command.result": {}, "contact.opted_in": {}, "contact.opted_out": {}, "contact.sync": {}, "contact.update": {},
	"customer.archived": {}, "customer.archiving": {}, "customer.created": {}, "customer.enabled": {}, "customer.number.attached": {}, "customer.number.disconnected": {}, "customer.number.transferred": {}, "customer.pairing_link.connected": {}, "customer.pairing_link.created": {}, "customer.pairing_link.expired": {}, "customer.pairing_link.failed": {}, "customer.pairing_link.opened": {}, "customer.pairing_link.revoked": {}, "customer.restored": {}, "customer.updated": {},
	"group.participant": {}, "group.update": {}, "history.sync": {}, "labels.update": {}, "message.ack": {}, "message.delete": {}, "message.echo": {}, "message.edited": {}, "message.failed": {}, "message.reaction": {}, "message.received": {}, "message.revoked": {}, "message.sent": {}, "message.update": {}, "message.vote": {}, "newsletter.update": {}, "order.payment_updated": {}, "presence.update": {}, "session.capabilities_updated": {}, "session.connected": {}, "session.logged_out": {}, "session.phone_offline": {}, "session.restriction_updated": {}, "session.status": {}, "template.status": {}, "usage.recorded": {}, "voice.asset_failed": {}, "voice.asset_ready": {},
}

// DecodeWebhookPayload decodes a verified event into an application-selected
// payload type. Unknown events remain accessible through Event.Payload.
func DecodeWebhookPayload[T any](e WebhookEvent) (T, error) {
	var result T
	err := json.Unmarshal(e.Payload, &result)
	return result, err
}

// WebhookHandler is a net/http adapter. It reads and verifies the exact request
// bytes before invoking the callback. Frameworks can mount it as a handler.
// Native HMAC signatures have no timestamp/replay claim: deduplicate event IDs
// in the application's durable store before applying effects.
func WebhookHandler(secret string, maxBodyBytes int64, handle func(*http.Request, WebhookEvent) error) http.Handler {
	if maxBodyBytes <= 0 {
		maxBodyBytes = 1 << 20
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "POST" {
			w.Header().Set("Allow", "POST")
			http.Error(w, "Method not allowed", 405)
			return
		}
		raw, err := io.ReadAll(http.MaxBytesReader(w, r.Body, maxBodyBytes))
		if err != nil {
			http.Error(w, "Invalid webhook body", 400)
			return
		}
		event, err := ConstructWebhookEvent(raw, r.Header.Get("X-Webhook-Signature"), secret)
		if err != nil {
			http.Error(w, "Invalid webhook", 400)
			return
		}
		if err = handle(r, event); err != nil {
			http.Error(w, "Webhook processing failed", 500)
			return
		}
		w.WriteHeader(http.StatusNoContent)
	})
}
