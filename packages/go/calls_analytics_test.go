package polymorfa

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var callAnalyticsFixtures = []operationFixture{
	{"OrganizationClient.Calls.List", "GET", "/platform/calls", "direction=inbound&limit=2&projectId=p&sessionId=s&since=2026-10-01T00%3A00%3A00Z", "", `{"data":[{"callId":"c","peerRef":"opaque","durationSeconds":0.5}],"page":{"nextCursor":null}}`, "data.0.durationSeconds", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wirePage(o.Calls().List(ctx, ListCallRecordsParams{CallFilters: CallFilters{ProjectID: "p", SessionID: "s", Direction: "inbound", Since: "2026-10-01T00:00:00Z"}, ListParams: ListParams{Limit: 2}}))
	}},
	{"OrganizationClient.Calls.Retrieve", "GET", "/platform/calls/c", "", "", `{"data":{"call":{"callId":"c","exclusive":false,"endReason":{"code":"future_reason","label":"Other"}},"telemetry":{"status":"reported","jitterMs":3.5},"appReports":{"status":"reported","connections":[{"connectionId":"connection","client":{"name":"polymorfa","version":"0.1","platform":"go"},"quality":{"packetsLost":0},"errors":[{"code":"media_failed","reportedAt":"2026-10-11"}]}]}}}`, "appReports.connections.0.quality.packetsLost", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Calls().Retrieve(ctx, "c", RetrieveCallRecordParams{}))
	}},
	{"OrganizationClient.Calls.Stats", "GET", "/platform/calls/stats", "groupBy=hour&timezone=Asia%2FBeirut", "", `{"data":{"groupBy":"hour","timezone":"Asia/Beirut","totals":{"calls":3,"answerRate":0.5},"groups":[{"key":"2026-10-11T14:00","averageDurationSeconds":2.5}],"heatmap":[{"dayOfWeek":1,"hour":0,"calls":2}]}}`, "groups.0.averageDurationSeconds", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Calls().Stats(ctx, CallStatsParams{GroupBy: "hour", Timezone: "Asia/Beirut"}))
	}},
	{"OrganizationClient.Analytics.Get", "GET", "/platform/analytics", "end=2000&sessionId=11111111-1111-4111-8111-111111111111&start=1000", "", `{"data":{"enabled":true,"period":{"start":1000,"end":2000},"summary":{"totalNumbers":1,"deviceAnalytics":{"detector":"message_id_prefix/v1","inventory":null},"engagement":{"readRate":0.2},"calls":{"followUp":{"rate":0.4}}},"numbers":[{"sessionId":"s","deviceAnalytics":{"inventory":{"devices":[{"deviceIndex":1,"estimatedPlatform":"iphone","listed":false}]}},"recipientActivity":{"rows":[{"averageQuietGapMs":10}]} }]}}`, "numbers.0.deviceAnalytics.inventory.devices.0.listed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		start, end := int64(1000), int64(2000)
		return wireData(o.Analytics().Get(ctx, AnalyticsParams{Start: &start, End: &end, SessionID: "11111111-1111-4111-8111-111111111111"}))
	}},
	{"ProjectClient.Analytics.Get", "GET", "/platform/projects/p/analytics", "", "", `{"data":{"enabled":false,"summary":null,"numbers":[],"callSeries":[{"sessionId":"s","answerRate":null,"total":2}],"series":[]}}`, "callSeries.0.total", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Analytics().Get(ctx, AnalyticsParams{}))
	}},
}

func TestTextResourceWire(t *testing.T) {
	for _, f := range []struct {
		name, method, path, query, mime, body string
		call                                  func(context.Context, *OrganizationClient, *ProjectClient) (Response[string], error)
	}{
		{"OrganizationClient.Calls.Export", "GET", "/platform/calls/export", "format=ndjson&limit=3&projectId=p", "application/x-ndjson", "{\"callId\":\"c\"}\n", func(ctx context.Context, o *OrganizationClient, p *ProjectClient) (Response[string], error) {
			r, err := o.Calls().Export(ctx, ExportCallRecordsParams{CallFilters: CallFilters{ProjectID: "p"}, ListParams: ListParams{Limit: 3}, Format: "ndjson"})
			if r.Data.Format != "ndjson" || r.Data.NextCursor == nil || *r.Data.NextCursor != "next" {
				t.Error("export typed metadata", r.Data)
			}
			return Response[string]{Data: r.Data.Body, Metadata: r.Metadata}, err
		}},
		{"OrganizationClient.Analytics.Metrics", "GET", "/platform/analytics/metrics", "format=openmetrics&segments=false&windowHours=24", "application/openmetrics-text", "# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled 0\n# EOF\n", func(ctx context.Context, o *OrganizationClient, p *ProjectClient) (Response[string], error) {
			v := false
			return o.Analytics().Metrics(ctx, AnalyticsMetricsParams{Format: "openmetrics", WindowHours: 24, Segments: &v})
		}},
		{"ProjectClient.Analytics.Metrics", "GET", "/platform/projects/p/analytics/metrics", "format=prometheus", "text/plain", "# TYPE polymorfa_analytics_enabled gauge\npolymorfa_analytics_enabled 0\n", func(ctx context.Context, o *OrganizationClient, p *ProjectClient) (Response[string], error) {
			return p.Analytics().Metrics(ctx, AnalyticsMetricsParams{})
		}},
	} {
		t.Run(f.name, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != f.method || r.URL.Path != f.path || r.URL.RawQuery != f.query {
					t.Errorf("wire %s %s", r.Method, r.URL)
				}
				if r.Header.Get("Accept") != f.mime || r.Header.Get("Authorization") != "Bearer "+orgConfig("").Credential.Value || r.Header.Get("Polymorfa-Version") != APIVersion {
					t.Error("text headers", r.Header)
				}
				w.Header().Set("Content-Type", f.mime+"; charset=utf-8")
				w.Header().Set("X-Request-Id", "text-request")
				w.Header().Set("Polymorfa-Next-Cursor", "next")
				w.Write([]byte(f.body))
			}))
			defer s.Close()
			o, _ := NewOrganizationClient(orgConfig(s.URL))
			p, _ := o.Project("p")
			r, err := f.call(context.Background(), o, p)
			if err != nil || r.Data != f.body || r.Metadata.RequestID != "text-request" {
				t.Fatalf("text response %#v %v", r, err)
			}
		})
	}
}
func TestCallExportAllAndRepeatedCursor(t *testing.T) {
	for _, repeated := range []bool{false, true} {
		t.Run(map[bool]string{true: "repeated", false: "csv"}[repeated], func(t *testing.T) {
			requests := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				w.Header().Set("Content-Type", "text/csv")
				if requests == 1 || repeated {
					w.Header().Set("Polymorfa-Next-Cursor", "next")
				}
				w.Write([]byte("callId\r\nc\r\n"))
			}))
			defer s.Close()
			o, _ := NewOrganizationClient(orgConfig(s.URL))
			var chunks []string
			var last error
			for chunk, err := range o.Calls().ExportAll(context.Background(), ExportCallRecordsParams{}) {
				if err != nil {
					last = err
					break
				}
				chunks = append(chunks, chunk)
			}
			if repeated {
				var e *Error
				if len(chunks) != 1 || !errors.As(last, &e) || e.Code != "invalid_response" {
					t.Fatalf("cursor replay yielded %v %v", chunks, last)
				}
			} else if strings.Join(chunks, "") != "callId\r\nc\r\nc\r\n" || requests != 2 || last != nil {
				t.Fatal(chunks, last, requests)
			}
		})
	}
}
func TestCallsAnalyticsValidationBeforeHTTP(t *testing.T) {
	requests := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { requests++ }))
	defer s.Close()
	o, _ := NewOrganizationClient(orgConfig(s.URL))
	p, _ := o.Project("11111111-1111-4111-8111-111111111111")
	ctx := context.Background()
	for _, f := range []func() error{
		func() error { _, e := o.Calls().Retrieve(ctx, "a b", RetrieveCallRecordParams{}); return e }, func() error {
			_, e := p.Calls().List(ctx, ListCallRecordsParams{CallFilters: CallFilters{ProjectID: "other"}})
			return e
		}, func() error {
			_, e := o.Calls().List(ctx, ListCallRecordsParams{CallFilters: CallFilters{Since: "2026-02-30T12:00:00Z"}})
			return e
		}, func() error {
			_, e := o.Calls().List(ctx, ListCallRecordsParams{ListParams: ListParams{Limit: 101}})
			return e
		}, func() error { _, e := o.Calls().Stats(ctx, CallStatsParams{GroupBy: "minute"}); return e }, func() error { _, e := o.Calls().Export(ctx, ExportCallRecordsParams{Format: "json"}); return e }, func() error {
			_, e := p.Analytics().Get(ctx, AnalyticsParams{ProjectID: "22222222-2222-4222-8222-222222222222"})
			return e
		}, func() error { _, e := o.Analytics().Get(ctx, AnalyticsParams{SessionID: "bad"}); return e }, func() error {
			a, b := int64(0), int64(367*86400000)
			_, e := o.Analytics().Get(ctx, AnalyticsParams{Start: &a, End: &b})
			return e
		}, func() error { _, e := o.Analytics().Metrics(ctx, AnalyticsMetricsParams{WindowHours: 169}); return e }} {
		if f() == nil {
			t.Error("invalid params accepted")
		}
	}
	if requests != 0 {
		t.Fatal("invalid params reached HTTP", requests)
	}
}
func TestMetricsRejectsMalformedBodies(t *testing.T) {
	for _, f := range []struct{ mime, body string }{{"text/html", "<html>"}, {"application/openmetrics-text", "# TYPE polymorfa_analytics_enabled gauge\n"}, {"application/openmetrics-text", "# EOF\n"}} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", f.mime)
			w.Write([]byte(f.body))
		}))
		o, _ := NewOrganizationClient(orgConfig(s.URL))
		_, err := o.Analytics().Metrics(context.Background(), AnalyticsMetricsParams{Format: "openmetrics"})
		s.Close()
		var e *Error
		if !errors.As(err, &e) || e.Code != "invalid_response" {
			t.Fatal(err)
		}
	}
}
