package polymorfa

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func TestUsageIteratorResumesAndRejectsInitialCursorLoop(t *testing.T) {
	for _, looping := range []bool{false, true} {
		t.Run(fmt.Sprint(looping), func(t *testing.T) {
			const start = "resume/+ ="
			var cursors []string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				cursor := r.URL.Query().Get("cursor")
				cursors = append(cursors, cursor)
				if r.URL.Path != "/platform/usage/records" || r.URL.Query().Get("projectId") != "project" || r.URL.Query().Get("meter") != "call.duration" {
					t.Error("usage scope/filter lost")
				}
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("x-request-id", "usage-resume")
				if looping {
					json.NewEncoder(w).Encode(map[string]any{"data": map[string]any{"records": []any{map[string]any{"id": "duplicate"}}, "nextCursor": start}})
					return
				}
				if cursor == start {
					io.WriteString(w, `{"data":{"records":[{"id":"resumed"}],"nextCursor":"next"}}`)
				} else {
					io.WriteString(w, `{"data":{"records":[{"id":"final"}],"nextCursor":null}}`)
				}
			}))
			defer server.Close()
			client, _ := NewOrganizationClient(orgConfig(server.URL))
			project, _ := client.Project("project")
			params := UsageRecordParams{Meter: "call.duration", ListParams: ListParams{Cursor: start}}
			sequence := project.Usage().IterateRecords(context.Background(), params)
			for pass := 0; pass < 2; pass++ {
				cursors = nil
				var ids []string
				var failure error
				for row, err := range sequence {
					if err != nil {
						failure = err
						break
					}
					ids = append(ids, row.ID)
				}
				if looping {
					e, ok := failure.(*Error)
					if !ok || e.Code != "invalid_response" || e.Metadata.RequestID != "usage-resume" || len(ids) != 0 || !reflect.DeepEqual(cursors, []string{start}) {
						t.Fatalf("initial cursor loop not rejected before yielding: %v %v %v", failure, ids, cursors)
					}
				} else if failure != nil || !reflect.DeepEqual(ids, []string{"resumed", "final"}) || !reflect.DeepEqual(cursors, []string{start, "next"}) {
					t.Fatalf("resume lost: %v %v %v", failure, ids, cursors)
				}
			}
			if params.Cursor != start {
				t.Fatal("caller pagination params mutated")
			}
		})
	}
}

func TestMessagingCampaignCreateKeepsInvocationIdentityAcrossRetry(t *testing.T) {
	for _, supplied := range []string{"", "caller-campaign-key"} {
		t.Run(supplied, func(t *testing.T) {
			var keys []string
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				keys = append(keys, r.Header.Get("Idempotency-Key"))
				if r.Method != "POST" || r.URL.Path != "/messaging/projects/project/campaigns" {
					t.Error("campaign route changed")
				}
				w.Header().Set("Content-Type", "application/json")
				if len(keys)%2 == 1 {
					w.WriteHeader(503)
					io.WriteString(w, `{"error":{"message":"retry"}}`)
					return
				}
				io.WriteString(w, campaignFixture)
			}))
			defer server.Close()
			client, _ := NewMessagingClient(orgConfig(server.URL))
			for invocation := 0; invocation < 2; invocation++ {
				response, err := client.Campaigns().Create(context.Background(), "project", CreateCampaignRequest{Name: "Campaign"}, RequestOptions{IdempotencyKey: supplied})
				if err != nil || response.Metadata.Attempts != 2 {
					t.Fatalf("campaign retry failed: %v %v", err, response.Metadata)
				}
			}
			if len(keys) != 4 || keys[0] == "" || keys[0] != keys[1] || keys[2] == "" || keys[2] != keys[3] {
				t.Fatal("unstable campaign invocation identity", keys)
			}
			if supplied != "" && (keys[0] != supplied || keys[2] != supplied) || supplied == "" && keys[0] == keys[2] {
				t.Fatal("caller or fresh invocation identity lost", keys)
			}
		})
	}
}

func TestMintedClientTokensRedactFormattingButPreserveExplicitJSON(t *testing.T) {
	const token = "pmfa_ct_synthetic_format_fixture"
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"data":{"token":"`+token+`","expiresAt":"2026-10-15"}}`)
	}))
	defer server.Close()
	client, _ := NewMessagingClient(orgConfig(server.URL))
	response, err := client.ClientTokens().Mint(context.Background(), MintClientTokenRequest{EphemeralID: "app", Session: "session"})
	if err != nil {
		t.Fatal(err)
	}
	for _, value := range []any{response, &response, response.Data, &response.Data, response.Data.Data, &response.Data.Data} {
		for _, format := range []string{"%v", "%+v", "%#v"} {
			printed := fmt.Sprintf(format, value)
			if strings.Contains(printed, token) || !strings.Contains(printed, "redacted") {
				t.Fatalf("token exposed by %s: %s", format, printed)
			}
		}
	}
	raw, err := json.Marshal(response.Data.Data)
	if err != nil || !strings.Contains(string(raw), token) || response.Data.Data.Token != token {
		t.Fatal("explicit client token access/JSON changed")
	}
}
