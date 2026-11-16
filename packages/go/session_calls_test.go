package polymorfa

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSessionCallsListReadsTheNumbersCallsWithIdentity(t *testing.T) {
	var got *http.Request
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		got = r
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":[{"callId":"C1","projectId":"p","sessionId":"support line","direction":"inbound","upstream":"linked_device","outcome":"missed","state":"missed","hasVideo":false,"peer":{"id":"15550100","phoneNumber":"+15550100"},"startedAt":"2026-10-27T10:00:00Z","connectedAt":null,"endedAt":null,"durationSeconds":null,"endReason":null}],"nextCursor":"next"}`))
	}))
	defer s.Close()
	page, err := mustMessaging(t, s.URL).SessionCalls().List(context.Background(), "support line", ListSessionCallsParams{
		ListParams: ListParams{Limit: 10, Cursor: "c1"}, Direction: "inbound", Outcome: "missed", Since: "2026-10-01T00:00:00Z",
	})
	if err != nil {
		t.Fatal(err)
	}
	if got.Method != "GET" || got.URL.EscapedPath() != "/messaging/support%20line/calls" ||
		got.URL.RawQuery != "cursor=c1&direction=inbound&limit=10&outcome=missed&since=2026-10-01T00%3A00%3A00Z" {
		t.Fatalf("request %s %s?%s", got.Method, got.URL.EscapedPath(), got.URL.RawQuery)
	}
	call := page.Data.Data[0]
	if call.Peer == nil || call.Peer.PhoneNumber != "+15550100" || call.Outcome != "missed" || page.Data.NextCursor == nil || *page.Data.NextCursor != "next" {
		t.Fatalf("decoded %+v", page.Data)
	}
}
