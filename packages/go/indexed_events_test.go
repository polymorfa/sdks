package polymorfa

import (
	"context"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestIndexedEventsFollowOffsets(t *testing.T) {
	requests := []string{}
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests = append(requests, r.URL.Query().Get("afterOffset"))
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Query().Get("afterOffset") == "0" {
			io.WriteString(w, `{"data":[],"page":{"hasMore":true,"nextOffset":"10","highWatermark":"10"}}`)
		} else {
			io.WriteString(w, `{"data":[{"id":"event","type":"message"}],"page":{"hasMore":false,"nextOffset":null,"highWatermark":"10"}}`)
		}
	}))
	defer s.Close()
	o, _ := NewOrganizationClient(orgConfig(s.URL))
	p, err := o.Events().List(context.Background(), ListEventsParams{AfterOffset: "0"})
	if err != nil || p.NextOffset != "10" || p.HighWatermark != "10" || len(requests) != 1 {
		t.Fatal(p, err, requests)
	}
	n := 0
	for v, err := range p.All(context.Background()) {
		if err != nil || v.ID != "event" {
			t.Fatal(v, err)
		}
		n++
	}
	if n != 1 || strings.Join(requests, ",") != "0,10" {
		t.Fatal(n, requests)
	}
	if _, err := o.Events().List(context.Background(), ListEventsParams{AfterOffset: "0", Since: "today"}); err == nil {
		t.Fatal("Mixed offset/time accepted")
	}
}
func TestIndexedEventsInvalidBounds(t *testing.T) {
	for _, body := range []string{`{"data":[],"page":{"hasMore":true,"nextOffset":"0","highWatermark":"10"}}`, `{"data":[],"page":{"hasMore":true,"nextOffset":"11","highWatermark":"10"}}`, `{"data":[],"page":{"hasMore":false,"nextOffset":"1","highWatermark":"10"}}`, `{"data":[],"page":{"highWatermark":"10"}}`} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			io.WriteString(w, body)
		}))
		o, _ := NewOrganizationClient(orgConfig(s.URL))
		if _, err := o.Events().ListIndexed(context.Background(), ListIndexedEventsParams{AfterOffset: "0"}); err == nil {
			t.Error(body)
		}
		s.Close()
	}
}
