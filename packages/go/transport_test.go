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
	data, err := os.ReadFile(filepath.Join(root, "contracts", "fixtures", "behavior.json"))
	if err != nil {
		t.Fatal(err)
	}
	var fixtures struct {
		Scenarios []struct {
			ID      string
			Request struct {
				Method  string
				Path    string
				Query   map[string]json.RawMessage
				Body    any
				Headers map[string]string
			}
			Outcome struct {
				Attempts          int
				Error             string
				Code              string
				RequestID         string
				MetadataRequestID string
				MaxNetworkRetries *int
				TimeoutMS         int
				CancelAfterMS     int
			}
		}
		Webhooks []struct {
			ID        string
			Protocol  string
			Body      string
			Secret    string
			Signature string
			Valid     bool
			Event     string
		}
		Configuration []struct {
			ID                string
			Client            string
			CredentialType    string
			Credential        string
			ProjectID         string
			BaseURL           string
			MaxNetworkRetries *int
			TimeoutMS         *int
			Valid             bool
			Field             string
		}
	}
	// JSON snake/camel names that differ from Go acronym spelling have explicit
	// aliases below, preserving the exact shared fixture contract.
	var raw struct {
		Scenarios     []json.RawMessage `json:"scenarios"`
		Webhooks      json.RawMessage   `json:"webhooks"`
		Configuration json.RawMessage   `json:"configuration"`
	}
	if err = json.Unmarshal(data, &raw); err != nil {
		t.Fatal(err)
	}
	for _, b := range raw.Scenarios {
		var f struct {
			ID      string `json:"id"`
			Request struct {
				Method  string                     `json:"method"`
				Path    string                     `json:"path"`
				Query   map[string]json.RawMessage `json:"query"`
				Body    any                        `json:"body"`
				Headers map[string]string          `json:"headers"`
			} `json:"request"`
			Outcome struct {
				Attempts          int    `json:"attempts"`
				Error             string `json:"error"`
				Code              string `json:"code"`
				RequestID         string `json:"requestId"`
				MetadataRequestID string `json:"metadataRequestId"`
				MaxNetworkRetries *int   `json:"maxNetworkRetries"`
				TimeoutMS         int    `json:"timeoutMs"`
				CancelAfterMS     int    `json:"cancelAfterMs"`
			} `json:"outcome"`
		}
		if json.Unmarshal(b, &f) != nil {
			t.Fatal("invalid shared fixture")
		}
		t.Run(f.ID, func(t *testing.T) {
			q := url.Values{}
			for k, v := range f.Request.Query {
				var values []string
				if json.Unmarshal(v, &values) == nil {
					q[k] = values
				} else {
					var text string
					if json.Unmarshal(v, &text) == nil {
						q.Set(k, text)
					} else {
						q.Set(k, string(v))
					}
				}
			}
			opts := RequestOptions{Headers: http.Header{"X-Polymorfa-Fixture": {f.ID}}, MaxNetworkRetries: f.Outcome.MaxNetworkRetries}
			for k, v := range f.Request.Headers {
				if strings.EqualFold(k, "Idempotency-Key") {
					opts.IdempotencyKey = v
				}
				if strings.EqualFold(k, "Polymorfa-Version") {
					opts.APIVersion = v
				}
			}
			if f.Outcome.TimeoutMS > 0 {
				opts.Timeout = time.Duration(f.Outcome.TimeoutMS) * time.Millisecond
			}
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			if f.Outcome.CancelAfterMS > 0 {
				timer := time.AfterFunc(time.Duration(f.Outcome.CancelAfterMS)*time.Millisecond, cancel)
				defer timer.Stop()
			}
			c := mustMessaging(t, ready.URL)
			var response RawResponse
			var gotErr error
			switch f.ID {
			case "sessions-list":
				r, e := c.Sessions().List(ctx, opts)
				gotErr = e
				response.Metadata = r.Metadata
				if e == nil && (len(r.Data.Data) != 1 || r.Data.Data[0].SessionID != "session_fixture") {
					t.Fatal("typed sessions response", r)
				}
			case "message-send":
				text := "Hello"
				r, e := c.Messages().Send(ctx, "support", SendMessageRequest{Conversation: ConversationReference{PhoneNumber: "+15551234567"}, Content: MessageContent{Text: &text}}, opts)
				gotErr = e
				response.Metadata = r.Metadata
				if e == nil && (r.Data.Data.ID != "msg_fixture" || r.Data.Data.WhatsAppIDs.LinkedDevices != "provider_fixture") {
					t.Fatal("typed message response", r)
				}
			default:
				response, gotErr = c.Raw(ctx, RawRequest{Method: f.Request.Method, Path: f.Request.Path, Query: q, Body: f.Request.Body, Options: opts})
			}
			if f.Outcome.Error == "" {
				if gotErr != nil {
					t.Fatal(gotErr)
				}
			} else {
				var e *Error
				if !errors.As(gotErr, &e) || string(e.Kind) != f.Outcome.Error {
					t.Fatalf("error got %#v want %s", gotErr, f.Outcome.Error)
				}
				if f.Outcome.Code != "" && e.Code != f.Outcome.Code {
					t.Fatal("API code", e.Code)
				}
				if f.Outcome.RequestID != "" && e.RequestID != f.Outcome.RequestID {
					t.Fatal("API request id", e.RequestID)
				}
				if strings.Contains(e.Message, "<html>") {
					t.Fatal("HTML leaked")
				}
			}
			if f.Outcome.MetadataRequestID != "" && response.Metadata.RequestID != f.Outcome.MetadataRequestID {
				t.Fatal("metadata request id", response.Metadata)
			}
			res, err := http.Get(ready.URL + "/__fixtures/" + f.ID + "/state")
			if err != nil {
				t.Fatal(err)
			}
			defer res.Body.Close()
			var state struct {
				Attempts   int   `json:"attempts"`
				Mismatches []any `json:"mismatches"`
			}
			if json.NewDecoder(res.Body).Decode(&state) != nil {
				t.Fatal("state decode")
			}
			if state.Attempts != f.Outcome.Attempts || len(state.Mismatches) > 0 {
				t.Fatalf("wire state %#v", state)
			}
		})
	}
	if json.Unmarshal(raw.Webhooks, &fixtures.Webhooks) != nil || json.Unmarshal(raw.Configuration, &fixtures.Configuration) != nil {
		t.Fatal("shared vectors decode")
	}
	for _, f := range fixtures.Webhooks {
		if f.Protocol != "native" {
			continue
		}
		t.Run(f.ID, func(t *testing.T) {
			event, err := ConstructWebhookEvent([]byte(f.Body), f.Signature, f.Secret)
			if (err == nil) != f.Valid {
				t.Fatal("signature vector", err)
			}
			if err == nil && f.Event != "" && event.Event != f.Event {
				t.Fatal(event.Event)
			}
		})
	}
	for _, f := range fixtures.Configuration {
		t.Run(f.ID, func(t *testing.T) {
			kind := OrganizationAPIKey
			switch f.CredentialType {
			case "projectToken":
				kind = ProjectToken
			case "clientToken":
				kind = ClientToken
			}
			c := Config{Credential: Credential{kind, f.Credential}, BaseURL: f.BaseURL, MaxNetworkRetries: f.MaxNetworkRetries}
			if f.TimeoutMS != nil {
				duration := time.Duration(*f.TimeoutMS) * time.Millisecond
				c.Timeout = &duration
			}
			var err error
			if f.Client == "messaging" {
				_, err = NewMessagingClient(c)
			} else if kind == ProjectToken {
				_, err = NewProjectClient(c, f.ProjectID)
			} else {
				_, err = NewOrganizationClient(c)
			}
			if (err == nil) != f.Valid {
				t.Fatal("configuration vector", err)
			}
			if err != nil && f.Field != "" {
				var e *Error
				if !errors.As(err, &e) || !strings.EqualFold(e.Field, f.Field) {
					t.Fatal("configuration field", err)
				}
			}
		})
	}
}

func TestOperationAdmissionIsFinal(t *testing.T) {
	for _, code := range []int{409, 429, 503} {
		t.Run(http.StatusText(code), func(t *testing.T) {
			attempts := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				attempts++
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Polymorfa-Operation-Id", "operation-admitted")
				w.Header().Set("Retry-After", "0")
				w.WriteHeader(code)
				io.WriteString(w, `{"error":{"code":"admitted","message":"Operation admitted"}}`)
			}))
			defer s.Close()
			_, err := mustMessaging(t, s.URL).Raw(context.Background(), RawRequest{Method: "POST", Path: "/write", Options: RequestOptions{IdempotencyKey: "stable"}})
			var e *Error
			if !errors.As(err, &e) || e.Metadata.OperationID != "operation-admitted" || attempts != 1 {
				t.Fatal(attempts, err)
			}
		})
	}
	for _, failure := range []string{"timeout", "truncated"} {
		t.Run(failure, func(t *testing.T) {
			attempts := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				attempts++
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Polymorfa-Operation-Id", "operation-admitted")
				w.Header().Set("X-Request-Id", "request-admitted")
				w.Header().Set("Content-Length", "100")
				io.WriteString(w, `{"data":`)
				w.(http.Flusher).Flush()
				if failure == "timeout" {
					time.Sleep(50 * time.Millisecond)
				}
			}))
			defer s.Close()
			_, err := mustMessaging(t, s.URL).Raw(context.Background(), RawRequest{Method: "GET", Path: "/body", Options: RequestOptions{Timeout: 10 * time.Millisecond}})
			var e *Error
			if !errors.As(err, &e) || e.Metadata.OperationID != "operation-admitted" || e.RequestID != "request-admitted" || !strings.Contains(e.Message, "Query the operation status") || attempts != 1 {
				t.Fatal(attempts, err)
			}
			want := ConnectionError
			if failure == "timeout" {
				want = TimeoutError
			}
			if e.Kind != want {
				t.Fatal(e.Kind)
			}
		})
	}
}
func TestRetryResponseBodyReadPreservesSafeWriteIdentity(t *testing.T) {
	for _, keyed := range []bool{false, true} {
		t.Run(map[bool]string{true: "keyed_write", false: "safe_get"}[keyed], func(t *testing.T) {
			attempts := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				attempts++
				if keyed && r.Header.Get("Idempotency-Key") != "stable" {
					t.Error("write key changed")
				}
				w.Header().Set("Content-Type", "application/json")
				if attempts == 1 {
					w.Header().Set("Content-Length", "100")
					w.Write([]byte(`{"data":`))
					return
				}
				w.Write([]byte(`{"data":{"value":"complete"}}`))
			}))
			defer s.Close()
			cfg := orgConfig(s.URL)
			retries := 1
			cfg.MaxNetworkRetries = &retries
			m, _ := NewMessagingClient(cfg)
			method := "GET"
			opts := RequestOptions{}
			if keyed {
				method = "POST"
				opts.IdempotencyKey = "stable"
			}
			r, err := m.Raw(context.Background(), RawRequest{Method: method, Path: "/platform/body", Options: opts})
			if err != nil || attempts != 2 || r.Metadata.Attempts != 2 {
				t.Fatal(r, err, attempts)
			}
		})
	}
}
func TestMalformedJSONKeepsProtocolClassification(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"invalid":`))
	}))
	defer s.Close()
	m, _ := NewMessagingClient(orgConfig(s.URL))
	_, err := m.Raw(context.Background(), RawRequest{Method: "GET", Path: "/platform/invalid"})
	var e *Error
	if !errors.As(err, &e) || e.Kind != ServerError || e.Code != "invalid_response" {
		t.Fatal("malformed JSON classified as timeout", err)
	}
}
