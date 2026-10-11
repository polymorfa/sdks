package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"net/http/httptest"
	"net/url"
	"reflect"
	"strings"
	"sync"
	"testing"
	"time"
)

func TestRequestLogsTypedWireAndFilters(t *testing.T) {
	fixture := `{"data":[{"id":"log","projectId":"project","createdAt":"2026-10-11T00:00:00Z","method":"POST","route":"/messaging/:session/messages","status":null,"durationMs":1.25,"result":"failure","source":"mcp","requestId":"request","traceId":null,"errorCode":"future_error","mcpTool":"send_message","credential":{"type":"client_token","id":null,"last4":null}}],"page":{"hasMore":false,"nextCursor":null,"followCursor":"follow"}}`
	var mu sync.Mutex
	queries := []url.Values{}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method != "GET" || r.URL.Path != "/platform/projects/project/request-logs" || r.Header.Get("Authorization") != "Bearer pmfa_"+strings.Repeat("a", 72) || r.Header.Get("Polymorfa-Version") != APIVersion {
			t.Errorf("wire %s %s", r.Method, r.URL.Path)
		}
		mu.Lock()
		queries = append(queries, r.URL.Query())
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-Id", "native_log")
		io.WriteString(w, fixture)
	}))
	defer server.Close()
	client, _ := NewOrganizationClient(orgConfig(server.URL))
	project, _ := client.Project("project")
	ctx := context.Background()
	route, credentialID, requestID, traceID, until := "/messaging/:session/messages", "key", "request", "trace", "2026-10-12"
	since := time.Date(2026, 10, 11, 1, 2, 3, 123000000, time.FixedZone("offset", 3600))
	limit := 2
	page, err := client.RequestLogs().List(ctx, ListRequestLogsParams{ProjectID: "project", Limit: &limit, RequestLogFilters: RequestLogFilters{Status: []RequestLogStatus{RequestLogStatusCode(404), RequestLog5xx}, Method: []RequestLogMethod{RequestLogPOST, RequestLogPATCH}, Route: &route, Source: RequestLogMCP, CredentialID: &credentialID, RequestID: &requestID, TraceID: &traceID, SinceTime: &since, Until: &until}})
	if err != nil || len(page.Items) != 1 || page.Items[0].DurationMs == nil || *page.Items[0].DurationMs != 1.25 || page.Items[0].Status != nil || page.Items[0].Credential.Type != RequestLogClientToken || page.Items[0].Credential.ID != nil || page.Metadata.RequestID != "native_log" || page.NextCursor != nil || page.HasMore || page.FollowCursor != "follow" {
		t.Fatal(page, err)
	}
	expected := url.Values{"status": {"404,5xx"}, "method": {"POST,PATCH"}, "route": {route}, "source": {"mcp"}, "credentialId": {credentialID}, "requestId": {requestID}, "traceId": {traceID}, "since": {"2026-10-11T00:02:03.123Z"}, "until": {until}, "limit": {"2"}}
	if !reflect.DeepEqual(queries[0], expected) {
		t.Fatal(queries[0], expected)
	}
	cursor := "older"
	if _, err := project.RequestLogs().List(ctx, ListRequestLogsParams{Cursor: &cursor, RequestLogFilters: RequestLogFilters{Status: []RequestLogStatus{}}}); err != nil {
		t.Fatal(err)
	}
	if _, err := project.RequestLogs().Follow(ctx, FollowRequestLogsParams{After: "follow", Limit: &limit}); err != nil {
		t.Fatal(err)
	}
	if !reflect.DeepEqual(queries[1], url.Values{"cursor": {"older"}}) || !reflect.DeepEqual(queries[2], url.Values{"after": {"follow"}, "limit": {"2"}}) {
		t.Fatal(queries)
	}
	calls := len(queries)
	for _, call := range []func() error{
		func() error { _, err := client.RequestLogs().List(ctx, ListRequestLogsParams{}); return err },
		func() error {
			_, err := project.RequestLogs().List(ctx, ListRequestLogsParams{ProjectID: "foreign"})
			return err
		},
		func() error {
			_, err := project.RequestLogs().List(ctx, ListRequestLogsParams{Cursor: &cursor, RequestLogFilters: RequestLogFilters{Route: &route}})
			return err
		},
		func() error {
			_, err := project.RequestLogs().List(ctx, ListRequestLogsParams{RequestLogFilters: RequestLogFilters{Since: &until, SinceTime: &since}})
			return err
		},
	} {
		if call() == nil {
			t.Fatal("invalid selection/filter accepted")
		}
	}
	if len(queries) != calls {
		t.Fatal("guard sent request")
	}
}
func TestRequestLogPageMalformedAndNullableFields(t *testing.T) {
	for _, body := range []string{`{"data":null,"page":{"hasMore":false,"nextCursor":null,"followCursor":"f"}}`, `{"data":[],"page":{"hasMore":false,"followCursor":"f"}}`, `{"data":[],"page":{"hasMore":"false","nextCursor":null,"followCursor":"f"}}`, `{"data":[],"page":{"hasMore":false,"nextCursor":null,"followCursor":null}}`, `{"data":[],"page":{"hasMore":false,"nextCursor":23,"followCursor":"f"}}`} {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Header().Set("X-Request-Id", "invalid_log")
			io.WriteString(w, body)
		}))
		client, _ := NewOrganizationClient(orgConfig(server.URL))
		_, err := client.RequestLogs().List(context.Background(), ListRequestLogsParams{ProjectID: "project"})
		var api *Error
		if !errors.As(err, &api) || api.Kind != ServerError || api.Code != "invalid_response" || api.Metadata.RequestID != "invalid_log" {
			t.Fatal(body, err)
		}
		server.Close()
	}
	var record RequestLog
	if json.Unmarshal([]byte(`{"id":"l","status":204,"durationMs":0,"result":"success","credential":null,"requestId":null}`), &record) != nil || record.Credential != nil || record.Status == nil || *record.Status != 204 || record.DurationMs == nil || *record.DurationMs != 0 {
		t.Fatal(record)
	}
}
func TestRequestLogsNativeTailBackfillRetryAndFollow(t *testing.T) {
	requests := []string{}
	var mu sync.Mutex
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		requests = append(requests, r.URL.RawQuery)
		attempt := len(requests)
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Request-Id", "tail")
		switch attempt {
		case 1:
			if r.URL.Query().Get("limit") != "2" || r.URL.Query().Get("status") != "5xx" {
				t.Error(r.URL.RawQuery)
			}
			io.WriteString(w, `{"data":[{"id":"two"},{"id":"one"}],"page":{"hasMore":false,"nextCursor":null,"followCursor":"after1"}}`)
		case 2:
			w.Header().Set("Retry-After", "0")
			w.WriteHeader(429)
			io.WriteString(w, `{"error":{"code":"rate_limited","message":"Wait"}}`)
		case 3:
			if r.URL.Query().Get("after") != "after1" || r.URL.Query().Get("status") != "" {
				t.Error(r.URL.RawQuery)
			}
			io.WriteString(w, `{"data":[{"id":"three"}],"page":{"hasMore":true,"nextCursor":null,"followCursor":"after2"}}`)
		case 4:
			if r.URL.Query().Get("after") != "after2" {
				t.Error(r.URL.RawQuery)
			}
			io.WriteString(w, `{"data":[{"id":"four"}],"page":{"hasMore":false,"nextCursor":null,"followCursor":"after3"}}`)
		default:
			t.Error("Extra request")
			w.WriteHeader(500)
		}
	}))
	defer server.Close()
	client, _ := NewOrganizationClient(orgConfig(server.URL))
	zero := 0
	seen := []string{}
	started := time.Now()
	for item, err := range client.RequestLogs().Tail(context.Background(), TailRequestLogsParams{ProjectID: "project", Backfill: 2, RequestLogFilters: RequestLogFilters{Status: []RequestLogStatus{RequestLog5xx}}}, RequestOptions{MaxNetworkRetries: &zero}) {
		if err != nil {
			t.Fatal(err)
		}
		seen = append(seen, item.ID)
		if item.ID == "four" {
			break
		}
	}
	if strings.Join(seen, ",") != "one,two,three,four" || len(requests) != 4 || time.Since(started) > time.Second {
		t.Fatal(seen, requests)
	}
}
func TestRequestLogsTailCancellationAndRetryAfter(t *testing.T) {
	now := time.Date(2026, 10, 11, 0, 0, 0, 0, time.UTC)
	for header, delay := range map[string]time.Duration{"": time.Minute, "invalid": time.Minute, "0": 0, "2": 2 * time.Second, "999999999999999999999999999999999": 5 * time.Minute, "Sun, 11 Oct 2026 00:00:03 GMT": 3 * time.Second, "Sun, 11 Oct 2026 00:20:00 GMT": 5 * time.Minute, "Sat, 10 Oct 2026 23:59:59 GMT": 0} {
		if got := RequestLogRetryAfter(header, now); got != delay {
			t.Fatal(header, got, delay)
		}
	}
	var mu sync.Mutex
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		mu.Lock()
		calls++
		mu.Unlock()
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("after") == "" {
			io.WriteString(w, `{"data":[],"page":{"hasMore":false,"nextCursor":null,"followCursor":"f"}}`)
		} else {
			w.Header().Set("Retry-After", "300")
			w.WriteHeader(429)
			io.WriteString(w, `{"error":{"code":"rate_limited","message":"Wait"}}`)
		}
	}))
	defer server.Close()
	client, _ := NewOrganizationClient(orgConfig(server.URL))
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	zero := 0
	started := time.Now()
	for _, err := range client.RequestLogs().Tail(ctx, TailRequestLogsParams{ProjectID: "project"}, RequestOptions{MaxNetworkRetries: &zero}) {
		t.Fatal("cancelled tail yielded", err)
	}
	if time.Since(started) > 500*time.Millisecond || calls != 2 {
		t.Fatal("rate wait cancellation", calls, time.Since(started))
	}
	for _, p := range []TailRequestLogsParams{{Interval: time.Millisecond}, {Backfill: 101}, {Backfill: -1}, {Interval: time.Second + time.Nanosecond}} {
		count := 0
		for _, err := range client.RequestLogs().Tail(context.Background(), p) {
			if err == nil {
				t.Fatal("validation missing")
			}
			count++
		}
		if count != 1 {
			t.Fatal(count)
		}
	}
}
