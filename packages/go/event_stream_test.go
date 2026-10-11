package polymorfa

import (
	"context"
	"encoding/base64"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"
)

type streamWireCase struct {
	SDKMethod    string
	Method       string
	Path         string
	Organization bool
}

var streamWireCases = []streamWireCase{
	{"ProjectClient.Events.Stream", "GET", "/platform/projects/p/events/stream", false},
	{"OrganizationClient.Events.Stream", "GET", "/platform/projects/p/events/stream", true},
}

func TestEventStreamWire(t *testing.T) {
	for _, f := range streamWireCases {
		t.Run(f.SDKMethod, func(t *testing.T) {
			requests := 0
			gaps := 0
			payload := base64.StdEncoding.EncodeToString([]byte(`{"id":"w","session":"s","timestamp":"today","event":"future.event","payload":{"a":42}}`))
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				requests++
				if r.Method != f.Method || r.URL.Path != f.Path || r.URL.RawQuery != "ack=manual&types=message.%2A" || r.Header.Get("Accept") != "text/event-stream" || r.Header.Get("Authorization") == "" {
					t.Error("stream request", r.URL, r.Header)
				}
				w.Header().Set("Content-Type", "text/event-stream")
				if requests == 1 {
					if r.Header.Get("Last-Event-Id") != "start" {
						t.Error("initial cursor")
					}
					io.WriteString(w, "\ufeff: heartbeat\r\nevent: ready\r\ndata: {\"type\":\"ready\",\"heartbeatIntervalMs\":1000}\r\n\r\n")
					io.WriteString(w, "data: {\"type\":\"gap\",\"reason\":\"retention_exceeded\",\"missedEvents\":2,\"requestedCursor\":\"start\"}\r\n\r\n")
					io.WriteString(w, "data: {\"type\":\"checkpoint\",\"cursor\":\"checkpoint\"}\r\n\r\n")
					return
				}
				if r.Header.Get("Last-Event-Id") != "checkpoint" {
					t.Error("checkpoint resume", r.Header)
				}
				io.WriteString(w, "data: {\"type\":\"event\",\"streamId\":\"stream\",\"sequence\":2,\"cursor\":\"next\",\n")
				io.WriteString(w, "data: \"event\":{\"id\":\"e\",\"projectId\":\"p\",\"type\":\"future.event\",\"payloadAvailability\":\"available\",\"payload\":{\"encoding\":\"base64\",\"data\":\""+payload+"\"}}}\n\n")
			}))
			defer s.Close()
			org, err := NewOrganizationClient(orgConfig(s.URL))
			if err != nil {
				t.Fatal(err)
			}
			project, _ := org.Project("p")
			resource := project.Events()
			params := EventStreamParams{Types: []string{"message.*"}, Since: "start", Ack: "manual", InitialDelay: time.Millisecond, MaxDelay: time.Millisecond, OnGap: func(g EventStreamGap) {
				if g.MissedEvents != 2 {
					t.Error(g)
				}
				gaps++
			}}
			if f.Organization {
				resource = org.Events()
				params.ProjectID = "p"
			}
			stream, err := resource.Stream(params)
			if err != nil {
				t.Fatal(err)
			}
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			received := 0
			for item, err := range stream.Items(ctx) {
				if err != nil {
					t.Fatal(err)
				}
				received++
				if item.Event.ID != "e" || item.Sequence != 2 || item.StreamID != "stream" || item.Webhook == nil || item.Webhook.Event != "future.event" {
					t.Fatal(item)
				}
				break
			}
			if received != 1 || requests != 2 || gaps != 1 || stream.Cursor() != "next" {
				t.Fatal(received, requests, gaps, stream.Cursor())
			}
		})
	}
}
func TestEventStreamHeartbeatAndRevocation(t *testing.T) {
	for _, mode := range []string{"heartbeat", "revoked"} {
		t.Run(mode, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				if mode == "revoked" {
					io.WriteString(w, "data: {\"type\":\"revoked\"}\n\n")
					return
				}
				io.WriteString(w, "data: {\"type\":\"ready\",\"heartbeatIntervalMs\":5}\n\n")
				w.(http.Flusher).Flush()
				<-r.Context().Done()
			}))
			defer s.Close()
			org, _ := NewOrganizationClient(orgConfig(s.URL))
			p, _ := org.Project("p")
			ctx, cancel := context.WithTimeout(context.Background(), time.Second)
			defer cancel()
			reconnects := 0
			stream, err := p.Events().Stream(EventStreamParams{InitialDelay: time.Millisecond, MaxDelay: time.Millisecond, OnReconnect: func(err error, delay time.Duration) {
				e, ok := err.(*Error)
				if !ok || e.Code != "heartbeat_missed" {
					t.Error(err)
				}
				reconnects++
				cancel()
			}})
			if err != nil {
				t.Fatal(err)
			}
			errorsSeen := 0
			for _, err := range stream.Items(ctx) {
				if err != nil {
					e, ok := err.(*Error)
					if !ok || e.Code != "stream_revoked" {
						t.Fatal(err)
					}
					errorsSeen++
				}
			}
			if mode == "heartbeat" && reconnects != 1 || mode == "revoked" && errorsSeen != 1 {
				t.Fatal(reconnects, errorsSeen)
			}
		})
	}
}

var streamAckFixtures = []operationFixture{
	{"ProjectClient.Events.AcknowledgeStream", "POST", "/platform/projects/p/events/stream/stream/ack", "", `{"cursor":"next","sequence":2}`, `{"data":{"streamId":"stream","acknowledgedCursor":"next","sequence":2,"replayed":false}}`, "acknowledgedCursor", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(p.Events().AcknowledgeStream(ctx, "stream", EventStreamAcknowledgement{"next", 2}, ""))
	}},
	{"OrganizationClient.Events.AcknowledgeStream", "POST", "/platform/projects/p/events/stream/stream/ack", "", `{"cursor":"next","sequence":2}`, `{"data":{"streamId":"stream","acknowledgedCursor":"next","sequence":2,"replayed":true}}`, "replayed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Events().AcknowledgeStream(ctx, "stream", EventStreamAcknowledgement{"next", 2}, "p"))
	}},
}
