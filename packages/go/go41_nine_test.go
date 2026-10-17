package polymorfa_test

import (
	"context"
	"errors"
	"fmt"
	sdk "github.com/polymorfa/sdks/packages/go"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// Independent fixtures follow API f97ad78 / TS 52f10de; none echo requests.
const go41Group = `{"success":true,"data":{"status":"unknown","syncedAt":null,"checkedAt":null,"capabilities":[{"key":"future.flag","kind":"feature","unit":null,"value":null,"source":null},{"key":"enabled","kind":"feature","unit":null,"value":false,"source":"client_default"}]}}`
const go41Phone = `{"session":"session /x","phone":"+15550000001","online":false,"devices":[{"deviceId":1},{"deviceId":99}]}`
const go41PhoneSend = `{"session":"session /x","to":"+15550000002","messageId":null}`
const go41Unlink = `{"session":"session /x","deviceId":99,"unlinked":true}`
const go41Retry = `{"success":true,"data":{"requestId":"req-19","status":"requested"}}`
const go41Delete = `{"success":true,"data":{"status":"deleted"}}`
const go41LogRow = `{"id":"18446744073709551615","projectId":"project /x","createdAt":"2026-10-16T00:00:00Z","method":"GET","route":"/messaging/:session/groups/:id/capabilities","status":null,"durationMs":0,"result":"failure","source":"api","requestId":"req-distinct","traceId":"trace-distinct","errorCode":null,"mcpTool":null,"credential":{"type":"client_token","id":null,"last4":null}}`
const go41Logs = `{"data":[` + go41LogRow + `],"page":{"nextCursor":null,"hasMore":false,"followCursor":"after-0"}}`
const go41Grant = `{"success":true,"data":{"host":"mmg.whatsapp.net","uploadUrl":"https://mmg.whatsapp.net/mms/image/token?auth=secret-grant","expiresAt":1792108800}}`
const go41Relay = `{"success":true,"data":{"directPath":"/mms/image/uploaded","url":"https://mmg.whatsapp.net/mms/image/uploaded","handle":"handle"}}`

type go41Route struct {
	name, method, path, body, result string
	status                           int
	server                           bool
	call                             func(context.Context, *sdk.MessagingClient, *sdk.OrganizationClient, sdk.RequestOptions) (any, error)
}

func go41Routes() []go41Route {
	return []go41Route{
		{"getGroupCapabilities", "GET", "/messaging/session%20%2Fx/groups/group%20%2Fx/capabilities", "", go41Group, 200, false, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			return m.Groups().GetCapabilities(c, "session /x", "group /x", p)
		}},
		{"getTestingPhone", "GET", "/messaging/testing/project%20%2Fx/numbers/session%20%2Fx/phone", "", go41Phone, 200, true, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			return m.Testing().GetPhone(c, "project /x", "session /x", p)
		}},
		{"sendTestingPhoneMessage", "POST", "/messaging/testing/project%20%2Fx/numbers/session%20%2Fx/phone/messages", `{"to":"+15550000002","text":"hello"}`, go41PhoneSend, 202, true, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			return m.Testing().SendPhoneMessage(c, "project /x", "session /x", sdk.SendTestingPhoneMessageRequest{To: "+15550000002", Text: "hello"}, p)
		}},
		{"unlinkTestingPhoneDevice", "POST", "/messaging/testing/project%20%2Fx/numbers/session%20%2Fx/phone/devices/99/unlink", "", go41Unlink, 200, true, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			return m.Testing().UnlinkPhoneDevice(c, "project /x", "session /x", 99, p)
		}},
		{"listProjectRequestLogs", "GET", "/platform/projects/project%20%2Fx/request-logs", "", go41Logs, 200, true, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			return o.RequestLogs().List(c, sdk.ListRequestLogsParams{ProjectID: "project /x"}, p)
		}},
		{"createMediaUploadGrant", "POST", "/messaging/session%20%2Fx/media/upload-grants", `{"type":"image","fileEncSha256":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA"}`, go41Grant, 200, true, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			return m.WhatsAppMedia().CreateUploadGrant(c, "session /x", sdk.UploadImage, make([]byte, 32), p)
		}},
		{"uploadEncryptedMedia", "POST", "/messaging/session%20%2Fx/media/uploads", strings.Repeat("c", 26), go41Relay, 200, false, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			return m.WhatsAppMedia().RelayUpload(c, "session /x", sdk.EncryptedMediaInfo{MediaType: sdk.UploadImage, FileEncSHA256: make([]byte, 32), EncryptedLength: 26}, func(context.Context) (io.ReadCloser, error) {
				return io.NopCloser(strings.NewReader(strings.Repeat("c", 26))), nil
			}, p)
		}},
		{"retryHistoryChunk", "POST", "/messaging/session%20%2Fx/history/chunks/retry", `{"syncType":"RECENT","chunkOrder":0,"regenerate":false}`, go41Retry, 200, true, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			b := false
			return m.HistorySync().RequestChunkRetry(c, "session /x", sdk.HistorySyncChunkRetryRequest{SyncType: sdk.HistoryRecent, Regenerate: &b}, p)
		}},
		{"deleteHistoryMedia", "POST", "/messaging/session%20%2Fx/history/media/delete", `{"directPath":"/blob","fileEncSha256":"AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA="}`, go41Delete, 200, true, func(c context.Context, m *sdk.MessagingClient, o *sdk.OrganizationClient, p sdk.RequestOptions) (any, error) {
			return m.HistorySync().DeleteChunk(c, "session /x", sdk.HistorySyncChunkDeleteRequest{DirectPath: "/blob", FileEncSHA256: make([]byte, 32)}, p)
		}},
	}
}
func TestGo41NinePublicRoutes(t *testing.T) {
	for _, route := range go41Routes() {
		for _, version := range []string{"", sdk.APIVersion, sdk.CustomerOwnedAPIVersion} {
			t.Run(route.name+"/"+version, func(t *testing.T) {
				calls := 0
				m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
					calls++
					b, _ := io.ReadAll(r.Body)
					if r.Method != route.method || r.URL.EscapedPath() != route.path || string(b) != route.body {
						t.Errorf("wrong route/body %s %s %s", r.Method, r.URL.EscapedPath(), b)
					}
					want := version
					if want == "" {
						want = sdk.APIVersion
						if route.name == "createMediaUploadGrant" || route.name == "uploadEncryptedMedia" || route.name == "retryHistoryChunk" || route.name == "deleteHistoryMedia" {
							want = sdk.CustomerOwnedAPIVersion
						}
					}
					if r.Header.Get("Polymorfa-Version") != want {
						t.Errorf("version %s", r.Header.Get("Polymorfa-Version"))
					}
					if route.name == "uploadEncryptedMedia" && (r.ContentLength != 26 || r.Header.Get("Content-Type") != "application/octet-stream" || r.URL.Query().Get("fileEncSha256") != strings.Repeat("A", 43)) {
						t.Error("binary upload contract")
					}
					w.Header().Set("Content-Type", "application/json")
					w.Header().Set("X-Request-Id", "request-id")
					w.Header().Set("X-Trace-Id", "trace-id")
					w.Header().Set("Idempotent-Replayed", "false")
					w.Header().Set("Set-Cookie", "secret")
					w.WriteHeader(route.status)
					io.WriteString(w, route.result)
				})
				v, e := route.call(context.Background(), m, o, sdk.RequestOptions{APIVersion: version})
				if e != nil || calls != 1 {
					t.Fatalf("result %v calls %d", e, calls)
				}
				switch x := v.(type) {
				case sdk.Response[sdk.Envelope[sdk.GroupCapabilities]]:
					if x.Data.Data.Capabilities[0].Value != nil || x.Data.Data.Capabilities[1].Value == nil || *x.Data.Data.Capabilities[1].Value || x.Metadata.RequestID != "request-id" || x.Metadata.Headers.Get("X-Trace-Id") != "trace-id" || x.Metadata.Headers.Get("Set-Cookie") != "" {
						t.Fatal("nullable/metadata")
					}
				case *sdk.RequestLogPage:
					if x.Items[0].ID != "18446744073709551615" || x.Items[0].Status != nil || *x.Items[0].TraceID == *x.Items[0].RequestID {
						t.Fatal("log identity/null")
					}
				case sdk.WhatsAppUploadGrant:
					if x.ExpiresAt.Unix() != 1792108800 || strings.Contains(fmt.Sprintf("%#v", x), "secret-grant") {
						t.Fatal("grant expiry/redaction")
					}
				}
			})
		}
	}
}
func TestGo41NineErrorsAndCancellation(t *testing.T) {
	for _, r := range go41Routes() {
		for _, code := range []string{sdk.ErrorCampaignApprovalRequired, sdk.ErrorCampaignApprovalStale, sdk.ErrorCampaignVariablesMissing, sdk.ErrorZeroKnowledgeSession, "future_code"} {
			t.Run(r.name+"/"+code, func(t *testing.T) {
				calls := 0
				m, o := go41Client(t, func(w http.ResponseWriter, q *http.Request) {
					calls++
					w.Header().Set("Content-Type", "application/json")
					w.Header().Set("X-Request-Id", "request")
					w.Header().Set("X-Trace-Id", "trace")
					w.Header().Set("Authorization", "secret")
					w.WriteHeader(409)
					fmt.Fprintf(w, `{"error":{"code":%q,"message":"blocked","param":"recipient"}}`, code)
				})
				zero := 0
				_, e := r.call(context.Background(), m, o, sdk.RequestOptions{MaxNetworkRetries: &zero})
				var api *sdk.Error
				if !errors.As(e, &api) || api.Code != code || api.Field != "recipient" || api.RequestID != "request" || api.Metadata.Headers.Get("X-Trace-Id") != "trace" || api.Metadata.Headers.Get("Authorization") != "" || calls != 1 {
					t.Fatalf("safe structured error %v calls %d", e, calls)
				}
			})
		}
		t.Run(r.name+"/cancel", func(t *testing.T) {
			var calls atomic.Int32
			m, o := go41Client(t, func(w http.ResponseWriter, q *http.Request) { calls.Add(1) })
			ctx, cancel := context.WithCancel(context.Background())
			cancel()
			_, e := r.call(ctx, m, o, sdk.RequestOptions{})
			if e == nil || calls.Load() != 0 {
				t.Fatal("cancelled request reached HTTP")
			}
		})
	}
}
func TestGo41NineMalformedSuccess(t *testing.T) {
	for _, r := range go41Routes() {
		for _, bad := range []string{`null`, `[]`, `{}`, `{"success":false,"data":{}}`, `{"data":{}}`, `{"success":true,"data":null}`, `{"success":true,"data":[]}`, `{"success":true,"data":{}}`, `{broken`, `<html>oops</html>`} {
			t.Run(r.name+"/"+bad, func(t *testing.T) {
				m, o := go41Client(t, func(w http.ResponseWriter, q *http.Request) {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(r.status)
					io.WriteString(w, bad)
				})
				if _, e := r.call(context.Background(), m, o, sdk.RequestOptions{}); e == nil {
					t.Fatal("accepted malformed success")
				}
			})
		}
	}
}
func TestGo41MessagingPrincipalMatrix(t *testing.T) {
	for _, kind := range []sdk.CredentialKind{sdk.OrganizationAPIKey, sdk.ProjectToken, sdk.ClientToken} {
		for _, r := range go41Routes() {
			if r.name == "listProjectRequestLogs" {
				continue
			}
			t.Run(string(kind)+"/"+r.name, func(t *testing.T) {
				calls := 0
				s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, q *http.Request) {
					calls++
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(r.status)
					io.WriteString(w, r.result)
				}))
				defer s.Close()
				token := "pmfa_" + strings.Repeat("a", 72)
				if kind == sdk.ProjectToken {
					token = "pmfa_pt_" + strings.Repeat("a", 93) + "A"
				}
				if kind == sdk.ClientToken {
					token = "pmfa_ct_scoped"
				}
				m, e := sdk.NewMessagingClient(sdk.Config{BaseURL: s.URL, Credential: sdk.Credential{Kind: kind, Value: token}})
				if e != nil {
					t.Fatal(e)
				}
				_, e = r.call(context.Background(), m, nil, sdk.RequestOptions{})
				denied := r.server && kind == sdk.ClientToken
				if denied {
					if e == nil || calls != 0 {
						t.Fatal("Client guard")
					}
				} else if e != nil || calls != 1 {
					t.Fatalf("supported principal refused %v", e)
				}
			})
		}
	}
}
func TestGo41HistoryRequiredSuccessAndLimits(t *testing.T) {
	for _, r := range go41Routes() {
		if r.name != "retryHistoryChunk" && r.name != "deleteHistoryMedia" {
			continue
		}
		for _, b := range []string{strings.Replace(r.result, `"success":true,`, "", 1), strings.Replace(r.result, `"success":true`, `"success":false`, 1)} {
			m, o := go41Client(t, func(w http.ResponseWriter, q *http.Request) {
				w.Header().Set("Content-Type", "application/json")
				io.WriteString(w, b)
			})
			if _, e := r.call(context.Background(), m, o, sdk.RequestOptions{}); e == nil {
				t.Fatal("canonical success required")
			}
		}
	}

}

func TestGo41NineResponseStatusAndContentType(t *testing.T) {
	for _, r := range go41Routes() {
		for _, mode := range []string{"empty204", "html"} {
			t.Run(r.name+"/"+mode, func(t *testing.T) {
				m, o := go41Client(t, func(w http.ResponseWriter, q *http.Request) {
					if mode == "empty204" {
						w.WriteHeader(204)
						return
					}
					w.Header().Set("Content-Type", "text/html")
					w.WriteHeader(r.status)
					io.WriteString(w, "<html>gateway</html>")
				})
				if _, e := r.call(context.Background(), m, o, sdk.RequestOptions{}); e == nil {
					t.Fatal("invalid status/content type accepted")
				}
			})
		}
	}
}
func TestGo41NineInFlightCancellation(t *testing.T) {
	for _, r := range go41Routes() {
		t.Run(r.name, func(t *testing.T) {
			started := make(chan struct{})
			m, o := go41Client(t, func(w http.ResponseWriter, q *http.Request) {
				io.Copy(io.Discard, q.Body)
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(r.status)
				w.(http.Flusher).Flush()
				close(started)
				<-q.Context().Done()
			})
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			done := make(chan error, 1)
			go func() { _, e := r.call(ctx, m, o, sdk.RequestOptions{}); done <- e }()
			<-started
			cancel()
			if e := <-done; e == nil {
				t.Fatal("in-flight cancellation accepted")
			}
		})
	}
}

func TestGo41ProjectTokenRequestLogsAndCursor(t *testing.T) {
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.URL.EscapedPath() != "/platform/projects/project%20%2Fx/request-logs" || r.URL.Query().Get("cursor") != "opaque-start" || !strings.HasPrefix(r.Header.Get("Authorization"), "Bearer pmfa_pt_") {
			t.Error("Project cursor/credential")
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, go41Logs)
	}))
	defer s.Close()
	p, e := sdk.NewProjectClient(sdk.Config{BaseURL: s.URL, Credential: sdk.Credential{Kind: sdk.ProjectToken, Value: "pmfa_pt_" + strings.Repeat("a", 93) + "A"}}, "project /x")
	if e != nil {
		t.Fatal(e)
	}
	cursor := "opaque-start"
	r, e := p.RequestLogs().List(context.Background(), sdk.ListRequestLogsParams{Cursor: &cursor})
	if e != nil || calls != 1 || r.Items[0].DurationMs == nil || *r.Items[0].DurationMs != 0 {
		t.Fatal(e)
	}
}
