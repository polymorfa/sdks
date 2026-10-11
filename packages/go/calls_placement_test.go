package polymorfa

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestCallsPlacementBindsOnlyServerPrincipal(t *testing.T) {
	for _, clientToken := range []bool{false, true} {
		t.Run(map[bool]string{false: "server", true: "client"}[clientToken], func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "POST" || r.URL.Path != "/messaging/voip/calls" {
					t.Error("route", r.Method, r.URL.Path)
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				if clientToken {
					if _, ok := body["session"]; ok {
						t.Error("client session leaked")
					}
					if _, ok := body["participant"]; ok {
						t.Error("client participant leaked")
					}
				} else if body["session"] != "bound" || body["participant"] != "worker" {
					t.Error("server identity", body)
				}
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"success":true,"data":{"callId":"call","session":"bound","video":false}}`))
			}))
			defer server.Close()
			credential := Credential{Kind: OrganizationAPIKey, Value: "pmfa_" + strings.Repeat("a", 72)}
			participant := "worker"
			if clientToken {
				credential = Credential{Kind: ClientToken, Value: "pmfa_ct_fixture"}
				participant = ""
			}
			calls, err := NewCallsClient(CallsClientConfig{Config: Config{Credential: credential, BaseURL: server.URL}, Session: "bound", Participant: participant})
			if err != nil {
				t.Fatal(err)
			}
			response, err := calls.Place(context.Background(), PlaceCallRequest{To: "+15551234567", Session: "untrusted", Participant: "untrusted"})
			if err != nil || response.Data.Data.CallID != "call" {
				t.Fatal(response, err)
			}
		})
	}
}
