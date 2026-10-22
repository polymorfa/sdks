package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync"
	"sync/atomic"
	"testing"
	"time"
)

func TestCampaignContractBoundAliasesAndMessagingCredentials(t *testing.T) {
	confined := map[string]bool{"getPlatformCampaignReplyFlow": true, "createPlatformCampaignReplyFlow": true, "setPlatformCampaignReplyFlow": true, "testSendPlatformCampaign": true, "listCampaignLaunchApprovals": true, "getCampaignLinks": true, "exportCampaignRecipients": true, "getProjectSignalCustody": true, "updateProjectSignalCustody": true, "getCustomerSignalCustody": true, "updateCustomerSignalCustody": true}
	for _, kind := range []CredentialKind{OrganizationAPIKey, ProjectToken} {
		t.Run(string(kind), func(t *testing.T) {
			for _, row := range contractRows() {
				if !confined[row.id] && !strings.HasPrefix(row.path, "/messaging/") {
					continue
				}
				t.Run(row.id, func(t *testing.T) {
					var expected string
					s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
						if r.Header.Get("Authorization") != "Bearer "+expected {
							t.Error("credential replaced")
						}
						if r.URL.EscapedPath() != row.path || r.URL.RawQuery != row.query {
							t.Errorf("retargeted: %s", r.URL)
						}
						if r.Method != "GET" && r.Method != "DELETE" {
							var b map[string]json.RawMessage
							_ = json.NewDecoder(r.Body).Decode(&b)
							if confined[row.id] && !strings.Contains(row.id, "SignalCustody") && string(b["projectId"]) != `"`+contractProject+`"` {
								t.Error("project body missing")
							}
						}
						writeContractFixture(w, row)
					}))
					defer s.Close()
					cfg := orgConfig(s.URL)
					if kind == ProjectToken {
						cfg.Credential = Credential{ProjectToken, "pmfa_pt_" + strings.Repeat("a", 93) + "A"}
					}
					expected = cfg.Credential.Value
					p, e := NewProjectClient(cfg, contractProject)
					if e != nil {
						t.Fatal(e)
					}
					m, e := NewMessagingClient(cfg)
					if e != nil {
						t.Fatal(e)
					}
					if _, e = callContract(context.Background(), row.id, m, nil, p, true, RequestOptions{}); e != nil {
						t.Fatal(e)
					}
				})
			}
		})
	}
	var calls atomic.Int64
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls.Add(1) }))
	defer s.Close()
	m, e := NewMessagingClient(Config{Credential: Credential{ClientToken, "pmfa_ct_synthetic"}, BaseURL: s.URL})
	if e != nil {
		t.Fatal(e)
	}
	for _, row := range contractRows() {
		if strings.HasPrefix(row.path, "/messaging/") {
			_, e := callContract(context.Background(), row.id, m, nil, nil, false, RequestOptions{})
			if e == nil {
				t.Fatal(row.id)
			}
			if strings.Contains(e.Error(), "pmfa_ct_synthetic") {
				t.Fatal("token in error")
			}
		}
	}
	if calls.Load() != 0 {
		t.Fatal("client token reached server")
	}
}
func TestCampaignContractImmutableProjectResources(t *testing.T) {
	var got []string
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = append(got, r.URL.Query().Get("projectId"))
		writeContractFixture(w, contractWireRow{model: linksJSON})
	}))
	defer s.Close()
	c, _ := NewOrganizationClient(orgConfig(s.URL))
	p1, _ := c.Project(contractProject)
	a := p1.Campaigns()
	p2, _ := p1.Project(contractCustomer)
	b := p2.Campaigns()
	_, e := a.Links(context.Background(), contractID)
	if e != nil {
		t.Fatal(e)
	}
	_, e = b.Links(context.Background(), contractID)
	if e != nil {
		t.Fatal(e)
	}
	_, e = a.Links(context.Background(), contractID)
	if e != nil {
		t.Fatal(e)
	}
	if strings.Join(got, ",") != contractProject+","+contractCustomer+","+contractProject {
		t.Fatal(got)
	}
}
func TestCampaignContractStableTestSendReplay(t *testing.T) {
	received := make(chan struct{})
	release := make(chan struct{})
	var count atomic.Int64
	var mu sync.Mutex
	var bodies, keys []string
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		mu.Lock()
		bodies = append(bodies, string(body))
		keys = append(keys, r.Header.Get("Idempotency-Key"))
		mu.Unlock()
		if count.Add(1) == 1 {
			close(received)
			<-release
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(503)
			_, _ = io.WriteString(w, `{"error":{"code":"busy"}}`)
			return
		}
		writeContractFixture(w, contractWireRow{model: sendJSON})
	}))
	defer s.Close()
	c, _ := NewOrganizationClient(orgConfig(s.URL))
	vars := map[string]CampaignVariable{"a": {String: cptr("original")}}
	opts := RequestOptions{Headers: http.Header{"X-Custom": {"original"}}}
	done := make(chan error, 1)
	go func() {
		_, e := c.Campaigns().TestSend(context.Background(), contractID, PlatformCampaignTestSendRequest{CampaignTestSendRequest: CampaignTestSendRequest{SessionID: contractID, To: "123", Variables: &vars}, ProjectID: contractProject}, opts)
		done <- e
	}()
	<-received
	vars["a"] = CampaignVariable{String: cptr("changed")}
	opts.Headers.Set("X-Custom", "changed")
	close(release)
	if e := <-done; e != nil {
		t.Fatal(e)
	}
	mu.Lock()
	defer mu.Unlock()
	if len(bodies) != 2 || bodies[0] != bodies[1] || keys[0] == "" || keys[0] != keys[1] || !strings.Contains(bodies[1], "original") {
		t.Fatal(bodies, keys)
	}
}
func TestCampaignContractUnsafeDefaultAndExplicitRetry(t *testing.T) {
	for _, explicit := range []bool{false, true} {
		t.Run(map[bool]string{false: "default", true: "explicit"}[explicit], func(t *testing.T) {
			var calls atomic.Int64
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("Retry-After", "0")
				w.WriteHeader(503)
				_, _ = io.WriteString(w, `{"error":{"code":"not_ready"}}`)
			}))
			defer s.Close()
			c, _ := NewOrganizationClient(orgConfig(s.URL))
			o := RequestOptions{IdempotencyKey: "caller-key"}
			if explicit {
				o.MaxNetworkRetries = cptr(1)
			}
			_, e := c.Projects().UpdateSignalCustody(context.Background(), contractProject, ProjectSignalCustodyUpdate{SignalModeDefault: SignalCustodyStandard}, o)
			if e == nil {
				t.Fatal("accepted503")
			}
			want := int64(1)
			if explicit {
				want = 2
			}
			if calls.Load() != want {
				t.Fatal(calls.Load())
			}
		})
	}
}
func TestCampaignContractReplayAndErrors(t *testing.T) {
	for _, tc := range []struct {
		status   int
		code     string
		replayed bool
	}{{409, "idempotency_completed", true}, {504, "result_unknown", true}, {503, "dispatch_unavailable", true}, {400, "new_open_code", false}, {401, "auth", false}, {402, "funding", false}, {403, "scope", false}, {404, "missing", false}, {413, "too_large", false}, {422, "missing_variable", false}, {429, "rate", false}} {
		t.Run(tc.code, func(t *testing.T) {
			var calls atomic.Int64
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Request-ID", "req-error")
				w.Header().Set("X-Trace-ID", "trace-error")
				w.Header().Set("Retry-After", "0")
				if tc.replayed {
					w.Header().Set("Idempotent-Replayed", "true")
				}
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, `{"error":{"code":"`+tc.code+`","param":"body.sessionId","message":"Safe refusal"}}`)
			}))
			defer s.Close()
			c, _ := NewOrganizationClient(orgConfig(s.URL))
			_, e := c.Campaigns().TestSend(context.Background(), contractID, PlatformCampaignTestSendRequest{CampaignTestSendRequest: CampaignTestSendRequest{SessionID: contractID, To: "123"}, ProjectID: contractProject}, RequestOptions{MaxNetworkRetries: cptr(0)})
			var api *Error
			if !errors.As(e, &api) || api.Code != tc.code || api.Status != tc.status || api.Field != "body.sessionId" || api.RequestID != "req-error" || api.Metadata.Headers.Get("X-Trace-ID") != "trace-error" {
				t.Fatal(e)
			}
			if calls.Load() != 1 {
				t.Fatal(calls.Load())
			}
		})
	}
	// A replay-marked retryable error stops even with retries enabled.
	for _, header := range []string{"Idempotent-Replayed", "X-Polymorfa-Operation-Id"} {
		t.Run(header, func(t *testing.T) {
			var n atomic.Int64
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				n.Add(1)
				v := "op"
				if header == "Idempotent-Replayed" {
					v = "true"
				}
				w.Header().Set(header, v)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(503)
				_, _ = io.WriteString(w, `{"error":{"code":"uncertain"}}`)
			}))
			defer s.Close()
			c, _ := NewOrganizationClient(orgConfig(s.URL))
			_, _ = c.Campaigns().TestSend(context.Background(), contractID, PlatformCampaignTestSendRequest{CampaignTestSendRequest: CampaignTestSendRequest{SessionID: contractID, To: "123"}, ProjectID: contractProject})
			if n.Load() != 1 {
				t.Fatal(n.Load())
			}
		})
	}
}
func TestCampaignContractCSVAndMalformedResponses(t *testing.T) {
	for _, tc := range []struct {
		name       string
		status     int
		mime, body string
	}{{"redirect301", 301, "text/csv", "x"}, {"redirect302", 302, "application/json", `{}`}, {"redirect307", 307, "text/csv", "x"}, {"redirect308", 308, "text/csv", "x"}, {"html200", 200, "text/html", "<html>"}, {"empty204", 204, "text/csv", ""}} {
		t.Run(tc.name, func(t *testing.T) {
			var calls atomic.Int64
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				w.Header().Set("Content-Type", tc.mime)
				w.Header().Set("Location", "/foreign")
				w.WriteHeader(tc.status)
				_, _ = io.WriteString(w, tc.body)
			}))
			defer s.Close()
			c, _ := NewOrganizationClient(orgConfig(s.URL))
			_, e := c.Campaigns().ExportRecipients(context.Background(), contractID, PlatformCampaignRecipientExportParams{ProjectID: contractProject})
			if e == nil || calls.Load() != 1 {
				t.Fatal(e, calls.Load())
			}
		})
	}
	for _, body := range []string{`null`, `{}`, `{"data":null}`, `{"data":[]}`, `{"data":{"revision":0}}`, `{"data":` + custodyJSON + `} {}`} {
		t.Run(body, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, body)
			}))
			defer s.Close()
			c, _ := NewOrganizationClient(orgConfig(s.URL))
			_, e := c.Projects().GetSignalCustody(context.Background(), contractProject)
			if e == nil {
				t.Fatal("accepted malformed response")
			}
		})
	}
}
func TestCampaignContractNativeCancellationAndBodyDeadline(t *testing.T) {
	for _, csv := range []bool{false, true} {
		for _, deadline := range []bool{false, true} {
			t.Run(map[bool]string{true: "csv", false: "json"}[csv]+map[bool]string{true: "-deadline", false: "-cancel"}[deadline], func(t *testing.T) {
				started := make(chan struct{})
				s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					if csv {
						w.Header().Set("Content-Type", "text/csv")
					}
					w.WriteHeader(200)
					w.(http.Flusher).Flush()
					close(started)
					<-r.Context().Done()
				}))
				defer s.Close()
				c, _ := NewOrganizationClient(orgConfig(s.URL))
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				done := make(chan error, 1)
				o := RequestOptions{MaxNetworkRetries: cptr(0)}
				if deadline {
					o.Timeout = 50 * time.Millisecond
				}
				go func() {
					var e error
					if csv {
						_, e = c.Campaigns().ExportRecipients(ctx, contractID, PlatformCampaignRecipientExportParams{ProjectID: contractProject}, o)
					} else {
						_, e = c.Projects().GetSignalCustody(ctx, contractProject, o)
					}
					done <- e
				}()
				<-started
				if !deadline {
					cancel()
				}
				select {
				case e := <-done:
					var api *Error
					want := CancelledError
					if deadline {
						want = TimeoutError
					}
					if !errors.As(e, &api) || api.Kind != want {
						t.Fatal(e)
					}
				case <-time.After(3 * time.Second):
					t.Fatal("stalled body escaped deadline")
				}
			})
		}
	}
}
func TestCampaignContractProfilePageCursorAndMetadata(t *testing.T) {
	var requests []string
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.RawQuery)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-ID", "page")
		_, _ = io.WriteString(w, `{"data":[],"page":{"nextCursor":null,"hasMore":false}}`)
	}))
	defer s.Close()
	c, _ := NewOrganizationClient(orgConfig(s.URL))
	r, e := c.AudienceProfiles().List(context.Background(), ListAudienceProfilesParams{Cursor: cptr(contractID), Limit: cptr(1)})
	if e != nil || r.Metadata.RequestID != "page" || r.Data.Data == nil || requests[0] != "cursor="+contractID+"&limit=1" {
		t.Fatal(r, e, requests)
	}
}

func TestCampaignContractExportPageAndProfileResponseNegatives(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Query().Get("cursor") != "a/b+?" || r.URL.Query().Get("limit") != "1" {
			t.Errorf("encoded cursor lost: %s", r.URL.RawQuery)
		}
		w.Header().Set("Content-Type", "text/csv")
		w.Header().Set("Content-Disposition", `attachment; filename="../report.csv"`)
		_, _ = io.WriteString(w, "phone,status\r\n")
	}))
	defer s.Close()
	c, _ := NewOrganizationClient(orgConfig(s.URL))
	v, e := c.Campaigns().ExportRecipients(context.Background(), contractID, PlatformCampaignRecipientExportParams{ProjectID: contractProject, CampaignRecipientExportParams: CampaignRecipientExportParams{Cursor: cptr("a/b+?"), Limit: cptr(1)}})
	if e != nil || v.Data.NextCursor != nil || v.Data.Filename == nil || *v.Data.Filename != "report.csv" {
		t.Fatal(v, e)
	}
	for _, body := range []string{`{"data":null,"page":{"nextCursor":null,"hasMore":false}}`, `{"data":[],"page":{"hasMore":false}}`, `{"data":[],"page":{"nextCursor":null,"hasMore":true}}`, `{"data":[],"page":{"nextCursor":"bad","hasMore":true}}`} {
		t.Run(body, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, body)
			}))
			defer server.Close()
			client, _ := NewOrganizationClient(orgConfig(server.URL))
			if _, e := client.AudienceProfiles().List(context.Background(), ListAudienceProfilesParams{}); e == nil {
				t.Fatal("invalid page accepted")
			}
		})
	}
	ctx, cancel := context.WithCancel(context.Background())
	cancel()
	if _, e := c.Campaigns().GetSettings(ctx); e == nil {
		t.Fatal("cancelled request accepted")
	}
}
