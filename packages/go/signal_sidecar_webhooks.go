package polymorfa

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"net/http"
	"regexp"
	"strconv"
	"time"
)

var signalSignaturePattern = regexp.MustCompile(`^v1=[a-f0-9]{64}$`)
var signalTimestampPattern = regexp.MustCompile(`^[0-9]{1,19}$`)

type SignalWebhookOptions struct {
	Tolerance *time.Duration
	Now       time.Time
}

func VerifySignalWebhook(raw []byte, headers http.Header, secret string, options SignalWebhookOptions) (SignalEvent, error) {
	invalid := func() (SignalEvent, error) {
		return SignalEvent{}, &Error{Kind: AuthenticationError, Code: "invalid_signal_webhook_signature", Message: "Signal webhook verification failed."}
	}
	if !signalSecret(secret) || len(raw) > signalMaxJSON {
		return invalid()
	}
	tolerance := 5 * time.Minute
	if options.Tolerance != nil {
		tolerance = *options.Tolerance
	}
	if tolerance < 0 {
		return SignalEvent{}, configuration("tolerance", "Webhook tolerance must be non-negative.")
	}
	now := options.Now
	if now.IsZero() {
		now = time.Now()
	}
	for _, key := range []string{"Signal-Node-Timestamp", "Signal-Node-Signature", "Signal-Node-Event-Id"} {
		if len(headers.Values(key)) != 1 {
			return invalid()
		}
	}
	stamp := headers.Get("Signal-Node-Timestamp")
	sig := headers.Get("Signal-Node-Signature")
	eventID := headers.Get("Signal-Node-Event-Id")
	if !signalTimestampPattern.MatchString(stamp) || !signalSignaturePattern.MatchString(sig) || eventID == "" {
		return invalid()
	}
	seconds, err := strconv.ParseInt(stamp, 10, 64)
	if err != nil {
		return invalid()
	}
	sentAt := time.Unix(seconds, 0)
	if sentAt.Before(now.Add(-tolerance)) || sentAt.After(now.Add(tolerance)) {
		return invalid()
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(stamp))
	mac.Write([]byte("."))
	mac.Write(raw)
	expected := "v1=" + hex.EncodeToString(mac.Sum(nil))
	if !hmac.Equal([]byte(expected), []byte(sig)) {
		return invalid()
	}
	event, err := parseSignalEvent(raw)
	if err != nil || event.ID != eventID {
		return invalid()
	}
	return event, nil
}

// ProcessSignalWebhook returns only after the caller's atomic durable dedup and
// effects commit. An HTTP handler may return 2xx after success. No fallback store
// is supplied and this helper never acknowledges an SSE event.
func ProcessSignalWebhook(ctx context.Context, raw []byte, headers http.Header, secret string, options SignalWebhookOptions, store SignalWebhookStore) (SignalEvent, bool, error) {
	event, err := VerifySignalWebhook(raw, headers, secret, options)
	if err != nil {
		return SignalEvent{}, false, err
	}
	if store == nil {
		return SignalEvent{}, false, configuration("store", "A durable atomic Signal webhook store is required.")
	}
	if ctx.Err() != nil {
		return SignalEvent{}, false, contextError(ctx, ctx.Err())
	}
	applied, err := store.ApplyOnce(ctx, event)
	if err != nil {
		return SignalEvent{}, false, &Error{Kind: ServerError, Code: "signal_webhook_persistence_failed", Message: "Signal webhook persistence was not confirmed."}
	}
	if ctx.Err() != nil {
		return SignalEvent{}, false, contextError(ctx, ctx.Err())
	}
	return event, !applied, nil
}
