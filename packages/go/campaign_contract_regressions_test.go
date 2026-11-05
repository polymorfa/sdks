package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

// f97ad78 campaign-flow-graph.ts validates the 64 UTF-8 byte input before
// toLocaleLowerCase("en-US"). Its actual parser accepts 32 U+0130 characters
// and returns 32 "i\u0307" pairs (96 UTF-8 bytes, 64 UTF-16 code units).
// The fixture came from that exact API parser (SHA256 a80889b3ee394c432a2dc5a74e95892ee5dd2c11f0da96dbabaf527eb5859118).
func normalizedKeywordFlow(t *testing.T) string {
	t.Helper()
	payload, err := os.ReadFile("testdata/campaign-flow-normalized-f97.json")
	if err != nil {
		t.Fatal(err)
	}
	var env struct {
		Data json.RawMessage `json:"data"`
	}
	if err = json.Unmarshal(payload, &env); err != nil {
		t.Fatal(err)
	}
	return string(env.Data)
}
func TestCampaignNormalizedKeywordResponse(t *testing.T) {
	for _, name := range []string{"org-get", "bound-get", "messaging-get", "org-create", "bound-create", "messaging-create"} {
		t.Run(name, func(t *testing.T) {
			var calls atomic.Int64
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if r.Method == "POST" {
					b, _ := io.ReadAll(r.Body)
					if !strings.Contains(string(b), strings.Repeat("İ", 32)) {
						t.Error("request keyword changed")
					}
				}
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{"success":true,"data":`+normalizedKeywordFlow(t)+`}`)
			}))
			defer s.Close()
			org, _ := NewOrganizationClient(orgConfig(s.URL))
			bound, _ := org.Project(contractProject)
			messaging, _ := NewMessagingClient(orgConfig(s.URL))
			b := contractGraph()
			b.Definition.Nodes[0].Edges[0].Match = CampaignReplyKeyword{Value: strings.Repeat("İ", 32)}
			var result Response[Envelope[CampaignReplyFlow]]
			var err error
			switch name {
			case "org-get":
				result, err = org.Campaigns().GetReplyFlow(context.Background(), contractID, CampaignProjectParams{ProjectID: contractProject})
			case "bound-get":
				result, err = bound.Campaigns().GetReplyFlow(context.Background(), contractID)
			case "messaging-get":
				result, err = messaging.Campaigns().GetReplyFlow(context.Background(), "slug", contractID)
			case "org-create":
				result, err = org.Campaigns().CreateReplyFlow(context.Background(), CreatePlatformCampaignReplyFlowRequest{CreateCampaignReplyFlowRequest: b, ProjectID: contractProject})
			case "bound-create":
				result, err = bound.Campaigns().CreateReplyFlow(context.Background(), b)
			case "messaging-create":
				result, err = messaging.Campaigns().CreateReplyFlow(context.Background(), "slug", b)
			}
			if err != nil {
				t.Fatal(err)
			}
			keyword, ok := result.Data.Data.Definition.Nodes[0].Edges[0].Match.(*CampaignReplyKeyword)
			if !ok || keyword.Value != strings.Repeat("i\u0307", 32) || calls.Load() != 1 {
				t.Fatal("normalized response lost")
			}
			b.Definition.Nodes[0].Edges[0].Match = CampaignReplyKeyword{Value: strings.Repeat("i\u0307", 32)}
			_, err = org.Campaigns().CreateReplyFlow(context.Background(), CreatePlatformCampaignReplyFlowRequest{CreateCampaignReplyFlowRequest: b, ProjectID: contractProject})
			if err == nil || calls.Load() != 1 {
				t.Fatal("normalized response illegally expanded outbound byte limit")
			}
		})
	}
	for _, invalid := range []string{strings.Repeat("i", 65), ""} {
		payload := strings.Replace(flowJSON(), `"value":"yes"`, `"value":`+strconvJSON(invalid), 1)
		var v CampaignReplyFlow
		if err := campaignDecode([]byte(payload), &v); err == nil {
			t.Fatal("invalid response keyword accepted")
		}
	}
}
func strconvJSON(v string) string { b, _ := json.Marshal(v); return string(b) }
func TestCampaignOptionalNullResponse(t *testing.T) {
	for _, tc := range []struct{ name, send string }{
		{"buttons-footer", `{"kind":"buttons","body":"Body","buttons":[{"id":"a","text":"A"}],"footer":null}`},
		{"list-footer", `{"kind":"list","body":"Body","buttonText":"Open","rows":[{"id":"a","title":"A"}],"footer":null}`},
		{"list-description", `{"kind":"list","body":"Body","buttonText":"Open","rows":[{"id":"a","title":"A","description":null}]}`},
		{"form-footer", `{"kind":"flow_form","body":"Body","buttonText":"Open","flowId":"22222222-2222-4222-8222-222222222222","screen":"START","footer":null}`},
	} {
		t.Run(tc.name, func(t *testing.T) {
			// The public contract permits omission, but never explicit null.
			for _, null := range []bool{true, false} {
				send := tc.send
				if !null {
					send = strings.ReplaceAll(strings.ReplaceAll(send, `,"footer":null`, ""), `,"description":null`, "")
				}
				payload := strings.Replace(flowJSON(), `{"kind":"text","text":"Hello"}`, send, 1)
				s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					_, _ = io.WriteString(w, `{"data":`+payload+`}`)
				}))
				org, _ := NewOrganizationClient(orgConfig(s.URL))
				_, err := org.Campaigns().GetReplyFlow(context.Background(), contractID, CampaignProjectParams{ProjectID: contractProject})
				s.Close()
				if null {
					var api *Error
					if !errors.As(err, &api) || api.Code != "invalid_response" {
						t.Fatal("explicit null accepted", err)
					}
				} else if err != nil {
					t.Fatal("omitted optional field rejected", err)
				}
			}
		})
	}
	// Required nullable fields remain null, and omission is still rejected.
	for _, tc := range []struct {
		payload string
		out     any
		field   string
	}{
		{profileJSON, &AudienceProfile{}, `"provenance":null,`},
		{sendJSON, &CampaignTestSend{}, `"messageId":null,`},
		{assignmentJSON, &CampaignReplyFlowAssignment{}, `,"replyFlowId":null`},
		{custodyJSON, &SignalCustodyDefault{}, `"signalModeDefault":null,`},
		{confirmationJSON, &StopConfirmationSettings{}, `"locale":null,`},
	} {
		if err := campaignDecode([]byte(tc.payload), tc.out); err != nil {
			t.Fatal("required null rejected", err)
		}
		if err := campaignDecode([]byte(strings.Replace(tc.payload, tc.field, "", 1)), tc.out); err == nil {
			t.Fatal("missing required nullable accepted")
		}
	}
}
func TestCampaignCallerIdempotencyHeaderCasing(t *testing.T) {
	for _, casing := range []string{"idempotency-key", "Idempotency-Key", "IDEMPOTENCY-KEY", "iDeMpOtEnCy-KeY"} {
		t.Run(casing, func(t *testing.T) {
			var keys []string
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				keys = append(keys, r.Header.Get("Idempotency-Key"))
				w.Header().Set("Content-Type", "application/json")
				_, _ = io.WriteString(w, `{"data":`+sendJSON+`}`)
			}))
			defer s.Close()
			org, _ := NewOrganizationClient(orgConfig(s.URL))
			opts := RequestOptions{Headers: http.Header{casing: {"caller-original"}}}
			for i := 0; i < 2; i++ {
				_, err := org.Campaigns().TestSend(context.Background(), contractID, PlatformCampaignTestSendRequest{CampaignTestSendRequest: CampaignTestSendRequest{SessionID: contractID, To: "123"}, ProjectID: contractProject}, opts)
				if err != nil {
					t.Fatal(err)
				}
			}
			if len(keys) != 2 || keys[0] != "caller-original" || keys[1] != "caller-original" || opts.Headers[casing][0] != "caller-original" || len(opts.Headers) != 1 {
				t.Fatal("caller identity or headers replaced", keys)
			}
		})
	}
	var calls atomic.Int64
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		writeContractFixture(w, contractWireRow{model: sendJSON})
	}))
	defer s.Close()
	org, _ := NewOrganizationClient(orgConfig(s.URL))
	body := PlatformCampaignTestSendRequest{CampaignTestSendRequest: CampaignTestSendRequest{SessionID: contractID, To: "123"}, ProjectID: contractProject}
	for _, headers := range []http.Header{
		{"idempotency-key": {"first"}, "Idempotency-Key": {"second"}},
		{"idempotency-key": {"first", "second"}},
		{"idempotency-key": {strings.Repeat("x", 256)}},
		{"idempotency-key": {""}},
		{"idempotency-key": {"   "}},
		{"idempotency-key": {"invalid\r\nheader"}},
		{"idempotency-key": {"invalid\x7fheader"}},
	} {
		if _, err := org.Campaigns().TestSend(context.Background(), contractID, body, RequestOptions{Headers: headers}); err == nil {
			t.Fatal("ambiguous or oversized caller key accepted")
		}
	}
	if calls.Load() != 0 {
		t.Fatal("invalid key reached HTTP")
	}
}

func TestCampaignCallerKeyAcrossNetworkRetry(t *testing.T) {
	received, release := make(chan struct{}), make(chan struct{})
	var calls atomic.Int64
	var keys, bodies []string
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		keys = append(keys, r.Header.Get("Idempotency-Key"))
		bodies = append(bodies, string(body))
		if calls.Add(1) == 1 {
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
	org, _ := NewOrganizationClient(orgConfig(s.URL))
	opts := RequestOptions{Headers: http.Header{"idempotency-key": {"caller-original"}}}
	done := make(chan error, 1)
	go func() {
		_, err := org.Campaigns().TestSend(context.Background(), contractID, PlatformCampaignTestSendRequest{CampaignTestSendRequest: CampaignTestSendRequest{SessionID: contractID, To: "123"}, ProjectID: contractProject}, opts)
		done <- err
	}()
	<-received
	opts.Headers["idempotency-key"][0] = "mutated"
	close(release)
	if err := <-done; err != nil {
		t.Fatal(err)
	}
	if len(keys) != 2 || keys[0] != "caller-original" || keys[1] != keys[0] || bodies[0] != bodies[1] {
		t.Fatal("caller identity or body changed across retry", keys)
	}
}
func TestCampaignIdempotencyOptionPrecedenceAndLegacy(t *testing.T) {
	for _, tc := range []struct {
		opts RequestOptions
		want string
	}{
		{RequestOptions{Headers: http.Header{"idempotency-key": {"same"}, "Idempotency-Key": {"same"}}}, "same"},
		{RequestOptions{IdempotencyKey: "explicit", Headers: http.Header{"idempotency-key": {"ignored"}, "IDEMPOTENCY-KEY": {"also-ignored"}}}, "explicit"},
	} {
		o, err := idempotent(tc.opts)
		if err != nil || o.IdempotencyKey != tc.want {
			t.Fatal("legacy helper lost caller key", err)
		}
		var got string
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			got = r.Header.Get("Idempotency-Key")
			writeContractFixture(w, contractWireRow{model: sendJSON})
		}))
		org, _ := NewOrganizationClient(orgConfig(s.URL))
		_, err = org.Campaigns().TestSend(context.Background(), contractID, PlatformCampaignTestSendRequest{CampaignTestSendRequest: CampaignTestSendRequest{SessionID: contractID, To: "123"}, ProjectID: contractProject}, tc.opts)
		s.Close()
		if err != nil || got != tc.want {
			t.Fatal("explicit option precedence changed", got, err)
		}
	}
	// Case-insensitive headers do not opt unsafe writes into automatic retries.
	var calls atomic.Int64
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls.Add(1)
		w.Header().Set("Retry-After", "0")
		w.WriteHeader(503)
		_, _ = io.WriteString(w, `{"error":{"code":"busy"}}`)
	}))
	defer s.Close()
	org, _ := NewOrganizationClient(orgConfig(s.URL))
	_, err := org.Campaigns().CreateReplyFlow(context.Background(), CreatePlatformCampaignReplyFlowRequest{contractGraph(), contractProject}, RequestOptions{Headers: http.Header{"idempotency-key": {"caller"}}})
	if err == nil || calls.Load() != 1 {
		t.Fatal("unsafe default retry changed", err, calls.Load())
	}
}
