package polymorfa

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"testing"
	"time"
)

func orgConfig(base string) Config {
	return Config{Credential: Credential{OrganizationAPIKey, "pmfa_" + strings.Repeat("a", 72)}, BaseURL: base}
}
func mustMessaging(t *testing.T, base string) *MessagingClient {
	t.Helper()
	c, err := NewMessagingClient(orgConfig(base))
	if err != nil {
		t.Fatal(err)
	}
	return c
}
func TestCredentialBoundaries(t *testing.T) {
	for _, test := range []struct {
		name      string
		c         Credential
		messaging bool
		valid     bool
	}{{"org", Credential{OrganizationAPIKey, "pmfa_" + strings.Repeat("a", 72)}, false, true}, {"project", Credential{ProjectToken, "pmfa_pt_" + strings.Repeat("a", 93) + "A"}, false, true}, {"client", Credential{ClientToken, "pmfa_ct_x"}, true, true}, {"client platform", Credential{ClientToken, "pmfa_ct_x"}, false, false}, {"listener", Credential{OrganizationAPIKey, "pmfa_ls_" + strings.Repeat("a", 69)}, false, false}, {"special", Credential{OrganizationAPIKey, "pmfa_at_" + strings.Repeat("a", 69)}, false, false}, {"project invalid tail", Credential{ProjectToken, "pmfa_pt_" + strings.Repeat("a", 93) + "B"}, false, false}, {"project as org", Credential{OrganizationAPIKey, "pmfa_pt_" + strings.Repeat("a", 69)}, false, false}} {
		t.Run(test.name, func(t *testing.T) {
			err := validateCredential(test.c, test.messaging)
			if (err == nil) != test.valid {
				t.Fatalf("unexpected credential validation: %v", err)
			}
			if err != nil && strings.Contains(err.Error(), test.c.Value) {
				t.Fatal("credential leaked")
			}
		})
	}
}
func TestBaseURLAndProjectRawConfinement(t *testing.T) {
	if _, err := NewMessagingClient(orgConfig("http://example.com")); err == nil {
		t.Fatal("plaintext credential accepted")
	}
	if _, err := NewMessagingClient(orgConfig("https://user:password@example.com")); err == nil {
		t.Fatal("URL credential accepted")
	}
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.EscapedPath() != "/platform/projects/a%2Fb/events" {
			t.Error(r.URL.EscapedPath())
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"ok":true}`)
	}))
	defer s.Close()
	org, err := NewOrganizationClient(orgConfig(s.URL + "/discarded"))
	if err != nil {
		t.Fatal(err)
	}
	p, err := org.Project("a/b")
	if err != nil {
		t.Fatal(err)
	}
	for _, path := range []string{"//example.com/x", "/../events", "/%2e%2e/events", "/platform/projects/other/events", "https://example.com"} {
		if _, err = p.Raw(context.Background(), RawRequest{Method: "GET", Path: path}); err == nil {
			t.Errorf("accepted %s", path)
		}
	}
	if _, err = p.Raw(context.Background(), RawRequest{Method: "GET", Path: "/events", Options: RequestOptions{Headers: http.Header{"Authorization": {"Bearer forbidden"}}}}); err == nil {
		t.Fatal("override accepted")
	}
	if _, err = p.Raw(context.Background(), RawRequest{Method: "GET", Path: "/events"}); err != nil {
		t.Fatal(err)
	}
	if calls != 1 {
		t.Fatal(calls)
	}
	c := orgConfig(s.URL)
	c.Credential = Credential{ProjectToken, "pmfa_pt_" + strings.Repeat("a", 93) + "A"}
	project, err := NewProjectClient(c, "a")
	if err != nil {
		t.Fatal(err)
	}
	if _, err = project.Project("b"); err == nil {
		t.Fatal("project token rebound")
	}
}
func TestRetryAndIdempotency(t *testing.T) {
	for _, test := range []struct {
		name, method, key string
		replay            bool
		attempts          int
	}{{"safe", "GET", "", false, 3}, {"unsafe", "POST", "", false, 1}, {"keyed", "POST", "stable", false, 3}, {"replayed", "POST", "stable", true, 1}} {
		t.Run(test.name, func(t *testing.T) {
			count := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				count++
				if r.Header.Get("Idempotency-Key") != test.key {
					t.Fatal("key changed")
				}
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "0")
				if test.replay {
					w.Header().Set("Idempotent-Replayed", "true")
				}
				if count < 3 {
					w.WriteHeader(503)
					io.WriteString(w, `{"error":{"code":"service_unavailable","message":"Retry later"}}`)
				} else {
					io.WriteString(w, `{"ok":true}`)
				}
			}))
			defer s.Close()
			c := mustMessaging(t, s.URL)
			result, err := c.Raw(context.Background(), RawRequest{Method: test.method, Path: "/test", Options: RequestOptions{IdempotencyKey: test.key}})
			if count != test.attempts {
				t.Fatal(count)
			}
			if test.attempts == 3 && (err != nil || result.Metadata.Attempts != 3) {
				t.Fatal(err, result.Metadata)
			}
			if test.attempts == 1 && err == nil {
				t.Fatal("expected error")
			}
		})
	}
}
func TestTimeoutCancellationAndHTML(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path == "/html" {
			w.Header().Set("Content-Type", "text/html")
			w.WriteHeader(502)
			io.WriteString(w, "<html>proxy failure</html>")
			return
		}
		select {
		case <-r.Context().Done():
		case <-time.After(100 * time.Millisecond):
		}
	}))
	defer s.Close()
	c := mustMessaging(t, s.URL)
	zero := 0
	_, err := c.Raw(context.Background(), RawRequest{Method: "GET", Path: "/timeout", Options: RequestOptions{Timeout: 10 * time.Millisecond, MaxNetworkRetries: &zero}})
	var e *Error
	if !errors.As(err, &e) || e.Kind != TimeoutError {
		t.Fatalf("timeout: %v", err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	_, err = c.Raw(ctx, RawRequest{Method: "GET", Path: "/cancel"})
	if !errors.As(err, &e) || e.Kind != CancelledError {
		t.Fatalf("cancel: %v", err)
	}
	_, err = c.Raw(context.Background(), RawRequest{Method: "GET", Path: "/html", Options: RequestOptions{MaxNetworkRetries: &zero}})
	if !errors.As(err, &e) || e.Kind != ServerError || strings.Contains(e.Error(), "<html>") {
		t.Fatalf("HTML: %v", err)
	}
}
func TestErrorTaxonomyAndMetadata(t *testing.T) {
	for status, kind := range map[int]ErrorKind{400: ValidationError, 401: AuthenticationError, 402: PaymentRequiredError, 403: AuthorizationError, 404: NotFoundError, 409: ConflictError, 429: RateLimitError, 500: ServerError} {
		t.Run(string(kind), func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Request-Id", "header-id")
				w.Header().Set("Polymorfa-RateLimit-Reason", "daily_allowance")
				w.Header().Set("Set-Cookie", "secret")
				w.WriteHeader(status)
				io.WriteString(w, `{"error":{"code":"future_error_code","message":"Failure","request_id":"body-id","request_log_url":"https://console.polymorfa.com/logs/1","docs":"https://docs.polymorfa.com/api/errors","details":{"retryable":false}}}`)
			}))
			defer s.Close()
			zero := 0
			c := mustMessaging(t, s.URL)
			_, err := c.Raw(context.Background(), RawRequest{Method: "GET", Path: "/test", Options: RequestOptions{MaxNetworkRetries: &zero}})
			var e *Error
			if !errors.As(err, &e) || e.Kind != kind || e.Code != "future_error_code" || e.RequestID != "body-id" || e.Metadata.Status != status || e.Metadata.Headers.Get("Set-Cookie") != "" {
				t.Fatalf("wrong error: %#v", err)
			}
		})
	}
}
func TestWebhookVerification(t *testing.T) {
	body := []byte(`{"id":"event_1","session":"","timestamp":"2026-10-11T00:00:00Z","event":"future.event","payload":{"value":1}}`)
	m := hmac.New(sha256.New, []byte("secret"))
	m.Write(body)
	signature := "sha256=" + hex.EncodeToString(m.Sum(nil))
	e, err := ConstructWebhookEvent(body, signature, "secret")
	if err != nil || e.Known() || e.ID != "event_1" {
		t.Fatal(e, err)
	}
	if VerifyWebhookSignature(append(body, ' '), signature, "secret") || VerifyWebhookSignature(body, "sha256=invalid", "secret") || VerifyWebhookSignature(body, signature, "") {
		t.Fatal("invalid signature accepted")
	}
	for _, bad := range [][]byte{[]byte(`{"id":"event","session":null,"timestamp":"now","event":"x","payload":{}}`), []byte(`[]`), {0xff}} {
		if _, err = ParseVerifiedWebhookEvent(bad); err == nil {
			t.Fatal("malformed event accepted")
		}
	}
}
func TestCursorPageLazyAndLoopGuard(t *testing.T) {
	requests := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests++
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("cursor") == "second" {
			io.WriteString(w, `{"data":[{"id":"b","type":"message.sent"}],"page":{"nextCursor":null}}`)
		} else {
			io.WriteString(w, `{"data":[{"id":"a","type":"message.received"}],"page":{"nextCursor":"second"}}`)
		}
	}))
	defer s.Close()
	c, err := NewOrganizationClient(orgConfig(s.URL))
	if err != nil {
		t.Fatal(err)
	}
	p, err := c.Events().List(context.Background(), ListEventsParams{})
	if err != nil || requests != 1 || !p.HasMore() {
		t.Fatal(p, err, requests)
	}
	ids := []string{}
	for event, err := range p.All(context.Background()) {
		if err != nil {
			t.Fatal(err)
		}
		ids = append(ids, event.ID)
	}
	if strings.Join(ids, ",") != "a,b" || requests != 2 {
		t.Fatal(ids, requests)
	}
}

// The same process-level wire server is used by all non-TypeScript SDKs.
func TestSharedWireFixtures(t *testing.T) {
	root := filepath.Join("..", "..")
	cmd := exec.Command("node", filepath.Join(root, "scripts", "sdk-fixture-server.mjs"), "--port", "0")
	stdout, err := cmd.StdoutPipe()
	if err != nil {
		t.Fatal(err)
	}
	cmd.Stderr = os.Stderr
	if err = cmd.Start(); err != nil {
		t.Fatal(err)
	}
	defer func() { cmd.Process.Kill(); cmd.Wait() }()
	line := make([]byte, 1)
	var base strings.Builder
	for {
		_, err = stdout.Read(line)
		if err != nil {
			t.Fatal(err)
		}
		if line[0] == '\n' {
			break
		}
		base.WriteByte(line[0])
	}
	var ready struct {
		URL string `json:"url"`
	}
	if err = json.Unmarshal([]byte(base.String()), &ready); err != nil {
		t.Fatalf("server start %s: %v", base.String(), err)
	}
	if ready.URL == "" {
		ready.URL = strings.TrimSpace(base.String())
	}
	for _, id := range []string{"sessions-list", "query-encoding", "safe-retry", "unsafe-no-retry", "idempotent-retry", "idempotent-replayed", "error-authentication", "error-authorization", "error-payment-required", "error-validation", "error-not-found", "error-conflict", "error-rate-limit", "error-server"} {
		t.Run(id, func(t *testing.T) {
			var fixture struct {
				Scenarios []struct {
					ID      string `json:"id"`
					Request struct {
						Method  string                     `json:"method"`
						Path    string                     `json:"path"`
						Query   map[string]json.RawMessage `json:"query"`
						Body    any                        `json:"body"`
						Headers map[string]string          `json:"headers"`
					} `json:"request"`
					Outcome struct {
						Attempts int `json:"attempts"`
					} `json:"outcome"`
				} `json:"scenarios"`
			}
			bytes, err := os.ReadFile(filepath.Join(root, "contracts", "fixtures", "behavior.json"))
			if err != nil {
				t.Fatal(err)
			}
			json.Unmarshal(bytes, &fixture)
			for _, f := range fixture.Scenarios {
				if f.ID != id {
					continue
				}
				q := url.Values{}
				for k, v := range f.Request.Query {
					var values []string
					if json.Unmarshal(v, &values) == nil {
						q[k] = values
					} else {
						var s string
						json.Unmarshal(v, &s)
						q.Set(k, s)
					}
				}
				o := RequestOptions{Headers: http.Header{"X-Polymorfa-Fixture": {id}}}
				for k, v := range f.Request.Headers {
					if strings.EqualFold(k, "Idempotency-Key") {
						o.IdempotencyKey = v
					}
				}
				c := mustMessaging(t, ready.URL)
				if id == "sessions-list" {
					r, e := c.Sessions().List(context.Background(), o)
					if e != nil || len(r.Data.Data) != 1 || r.Data.Data[0].SessionID != "session_fixture" {
						t.Fatal(r, e)
					}
				} else {
					c.Raw(context.Background(), RawRequest{Method: f.Request.Method, Path: f.Request.Path, Query: q, Body: f.Request.Body, Options: o})
				}
				res, err := http.Get(ready.URL + "/__fixtures/" + id + "/state")
				if err != nil {
					t.Fatal(err)
				}
				defer res.Body.Close()
				var state struct {
					Attempts   int   `json:"attempts"`
					Mismatches []any `json:"mismatches"`
				}
				json.NewDecoder(res.Body).Decode(&state)
				if state.Attempts != f.Outcome.Attempts || len(state.Mismatches) > 0 {
					t.Fatalf("wire state %#v", state)
				}
				return
			}
			t.Skip("Fixture scenario not present")
		})
	}
}
