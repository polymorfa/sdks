package polymorfa

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"
)

func TestEventStreamLiveSourceNativeWire(t *testing.T) {
	webhook := `{"id":"w","session":"s","timestamp":"2026-10-11T00:00:00Z","event":"future.event","payload":{"enabled":false}}`
	received := make(chan string, 1)
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.URL.Path != "/platform/projects/p/events/stream" || r.Header.Get("Last-Event-ID") != "saved" || r.URL.Query().Get("types") != "future.*" {
			t.Errorf("source wire %s", r.URL)
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintln(w, `data: {"type":"event","cursor":"missing","streamId":"stream","sequence":1,"event":{"id":"metadata","payload":null}}`)
		fmt.Fprintln(w)
		fmt.Fprintf(w, "data: {\"type\":\"event\",\"cursor\":\"delivered\",\"streamId\":\"stream\",\"sequence\":2,\"event\":{\"id\":\"retained\",\"payload\":{\"data\":%q}}}\n\n", base64.StdEncoding.EncodeToString([]byte(webhook)))
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer server.Close()
	client, _ := NewOrganizationClient(orgConfig(server.URL))
	project, _ := client.Project("p")
	source, err := project.Events().LiveSource(EventStreamParams{Types: []string{"future.*"}})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	cursor := "saved"
	subscription, err := source.Subscribe(ctx, func(events []WebhookEvent, meta LiveEventMetadata) {
		if len(events) != 1 || events[0].ID != "w" || string(events[0].Payload) != `{"enabled":false}` {
			t.Error(events)
		}
		received <- meta.Cursor
		cancel()
	}, LiveEventSubscriptionOptions{Cursor: &cursor})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case got := <-received:
		if got != "delivered" {
			t.Fatal(got)
		}
	case <-time.After(time.Second):
		t.Fatal("listener did not receive retained event")
	}
	subscription.Cancel()
	select {
	case <-subscription.Done():
	case <-time.After(time.Second):
		t.Fatal("body did not close")
	}
	if requests.Load() != 1 {
		t.Fatal(requests.Load())
	}
	if _, err := project.Events().Stream(EventStreamParams{ProjectID: "foreign"}); err == nil {
		t.Fatal("foreign stream target accepted")
	}
}
func TestEventStreamLiveSourceErrorsAndPayloadRecovery(t *testing.T) {
	var requests atomic.Int32
	var recovered atomic.Int32
	done := make(chan struct{})
	var failure error
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "text/event-stream")
		switch requests.Add(1) {
		case 1:
			io.WriteString(w, "data: {\"type\":\"event\",\"cursor\":\"bad\",\"event\":{\"payload\":{\"data\":\"%%%\"}}}\n\n")
		case 2:
			if r.Header.Get("Last-Event-ID") != "" {
				t.Error("malformed event advanced the resume cursor")
			}
			io.WriteString(w, "data: {\"type\":\"revoked\"}\n\n")
		default:
			t.Error("terminal stream reconnected")
		}
	}))
	defer server.Close()
	client, _ := NewOrganizationClient(orgConfig(server.URL))
	source, _ := client.Events().LiveSource(EventStreamParams{ProjectID: "p", InitialDelay: time.Millisecond, MaxDelay: time.Millisecond, OnReconnect: func(err error, delay time.Duration) {
		var api *Error
		if !errors.As(err, &api) || api.Code != "invalid_response" {
			t.Error(err)
		}
		recovered.Add(1)
	}})
	subscription, err := source.Subscribe(context.Background(), func([]WebhookEvent, LiveEventMetadata) { t.Error("malformed event delivered") }, LiveEventSubscriptionOptions{OnError: func(err error) { failure = err; close(done) }})
	if err != nil {
		t.Fatal(err)
	}
	select {
	case <-done:
	case <-time.After(time.Second):
		t.Fatal("terminal error not reported")
	}
	<-subscription.Done()
	var api *Error
	if !errors.As(failure, &api) || api.Code != "stream_revoked" || requests.Load() != 2 || recovered.Load() != 1 {
		t.Fatal(failure, requests.Load(), recovered.Load())
	}
	if _, err := NewEventStreamSource(nil, EventStreamParams{}); err == nil {
		t.Fatal("missing factory")
	}
	if _, err := source.Subscribe(context.Background(), nil, LiveEventSubscriptionOptions{}); err == nil {
		t.Fatal("missing listener")
	}
	raw, _ := json.Marshal(api.Metadata)
	if len(raw) == 0 {
		t.Fatal("metadata")
	}
}
