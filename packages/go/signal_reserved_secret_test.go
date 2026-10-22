package polymorfa

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"net/http"
	"net/http/httptest"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

// Synthetic values shaped like Polymorfa credentials. None is a real secret.
var reservedSignalSecrets = []string{
	"pmfa_" + strings.Repeat("A", 72),
	"pmfa_pt_" + strings.Repeat("B", 93) + "A",
	"pmfa_ct_synthetic-client-token-value",
	"pmfa_ls_synthetic-link-session-value",
	"pmfa_at_synthetic-special-purpose-value",
	"pmfa_wst_synthetic-socket-ticket-value",
	"pmfa_sd_synthetic-session-device-value",
	"pmfa_independent_looking_but_reserved",
}

func signHMAC(secret, stamp string, raw []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(stamp + "."))
	mac.Write(raw)
	return "v1=" + hex.EncodeToString(mac.Sum(nil))
}

func TestSignalReservedPolymorfaSecretsRejectedBeforeRequests(t *testing.T) {
	var requests atomic.Int32
	var bearer atomic.Value
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		bearer.Store(r.Header.Get("Authorization"))
		w.WriteHeader(http.StatusServiceUnavailable)
	}))
	defer server.Close()
	for _, secret := range reservedSignalSecrets {
		client, err := NewSignalSidecarClient(SignalSidecarOptions{URL: server.URL, Secret: secret, HTTPClient: server.Client()})
		var sdkErr *Error
		if client != nil || !errors.As(err, &sdkErr) || sdkErr.Kind != ConfigurationError || strings.Contains(err.Error(), secret) {
			t.Fatalf("reserved secret %q accepted or leaked: %v", secret[:8], err)
		}
	}
	if requests.Load() != 0 {
		t.Fatal("reserved secret configuration reached the network")
	}
	client := signalClient(t, server.URL, "synthetic-independent-application-secret")
	if _, err := client.Sessions(context.Background()); err == nil || requests.Load() != 1 || bearer.Load() != "Bearer synthetic-independent-application-secret" {
		t.Fatal("independent secret control", err, requests.Load())
	}
}

func TestSignalWebhookRejectsReservedPolymorfaSecretsBeforeHMAC(t *testing.T) {
	v := signalGolden(t)
	raw := []byte(v["rawBody"])
	seconds, _ := strconv.ParseInt(v["timestamp"], 10, 64)
	options := SignalWebhookOptions{Now: time.Unix(seconds, 0)}
	for _, secret := range append(reservedSignalSecrets, v["secret"]) {
		headers := http.Header{}
		headers.Set("Signal-Node-Signature", signHMAC(secret, v["timestamp"], raw))
		headers.Set("Signal-Node-Timestamp", v["timestamp"])
		headers.Set("Signal-Node-Event-Id", v["eventId"])
		event, err := VerifySignalWebhook(raw, headers, secret, options)
		if secret == v["secret"] {
			if err != nil || event.ID != v["eventId"] || headers.Get("Signal-Node-Signature") != v["signature"] {
				t.Fatal("independent key exact HMAC control", err)
			}
			continue
		}
		var sdkErr *Error
		if err == nil || !errors.As(err, &sdkErr) || sdkErr.Code != "invalid_signal_webhook_signature" || strings.Contains(err.Error(), secret) {
			t.Fatalf("reserved webhook key %q authenticated: %v", secret[:8], err)
		}
	}
}
