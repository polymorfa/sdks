package storage_test

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"

	"github.com/polymorfa/sdks/packages/go/storage"
)

// The D1 application secret is independent of Polymorfa credentials: reserved
// pmfa_ prefixes and out-of-range lengths fail before any network request.
func TestD1ApplicationSecretBoundaryPublic(t *testing.T) {
	const authority, prefix = "fixture-customer-a", "bridge_a_"
	var calls atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		secret := strings.TrimPrefix(r.Header.Get("Authorization"), "Bearer ")
		sign := func(content string) string {
			mac := hmac.New(sha256.New, []byte(secret))
			mac.Write([]byte(content))
			return "v1=" + hex.EncodeToString(mac.Sum(nil))
		}
		nonce := r.Header.Get("Polymorfa-Storage-Nonce")
		if r.URL.Path != "/handshake" || r.Header.Get("Polymorfa-Storage-Signature") != sign(nonce+".GET./handshake.") {
			w.WriteHeader(401)
			return
		}
		body, _ := json.Marshal(map[string]any{"contract": storage.D1BridgeContract, "schemaVersion": 2, "authority": authority, "tablePrefix": prefix, "data": map[string]any{"atomicCommit": true, "maxCommitSize": 50, "maxGetSize": 1000, "maxQuerySize": 1000, "maxBodyBytes": 8 * 1024 * 1024, "conditionalDeletes": true, "setupAllowed": false}})
		w.Header().Set("Polymorfa-Storage-Nonce", nonce)
		w.Header().Set("Polymorfa-Storage-Signature", sign(nonce+".200."+string(body)))
		w.Write(body)
	}))
	defer server.Close()
	connect := func(secret string) error {
		_, err := storage.NewD1Adapter(context.Background(), storage.D1Options{URL: server.URL, Authority: authority, TablePrefix: prefix, Secret: secret})
		return err
	}
	filler := "synthetic-fixture-value-0123456789"
	rejected := []string{"pmfa_" + strings.Repeat("x", 251), strings.Repeat("x", 31), strings.Repeat("x", 257)}
	for _, p := range []string{"pmfa_", "pmfa_pt_", "pmfa_ct_", "pmfa_ls_", "pmfa_at_", "pmfa_wst_", "pmfa_sd_"} {
		rejected = append(rejected, p+filler)
	}
	for _, secret := range rejected {
		err := connect(secret)
		if err == nil {
			t.Fatalf("secret %q accepted", secret[:min(len(secret), 9)])
		}
		if strings.Contains(err.Error(), secret) {
			t.Fatal("error leaked secret")
		}
	}
	if n := calls.Load(); n != 0 {
		t.Fatalf("rejected configuration sent %d requests", n)
	}
	for _, secret := range []string{strings.Repeat("x", 32), strings.Repeat("x", 256), "PMFA_uppercase-is-not-reserved-0123456789", "xpmfa_not-a-prefix-fixture-0123456789"} {
		if err := connect(secret); err != nil {
			t.Fatal("valid independent secret", err)
		}
	}
	if n := calls.Load(); n != 4 {
		t.Fatalf("valid handshakes %d", n)
	}
}
