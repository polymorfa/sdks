package storage

import (
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"iter"
	"net/http"
	"net/http/httptest"
	"sync/atomic"
	"testing"
	"time"

	polymorfa "github.com/polymorfa/sdks/packages/go"
)

type sourceFixture struct {
	items     []polymorfa.EventStreamItem
	params    polymorfa.EventStreamParams
	acked     int
	gap       bool
	beforeAck func(polymorfa.EventStreamItem) error
}

func (s *sourceFixture) Stream(ctx context.Context, p polymorfa.EventStreamParams) (iter.Seq2[polymorfa.EventStreamItem, error], error) {
	s.params = p
	return func(yield func(polymorfa.EventStreamItem, error) bool) {
		if s.gap {
			p.OnGap(polymorfa.EventStreamGap{Reason: "retention_exceeded"})
			return
		}
		for _, item := range s.items {
			if !yield(item, nil) {
				return
			}
		}
	}, nil
}
func (s *sourceFixture) Acknowledge(ctx context.Context, item polymorfa.EventStreamItem, project string) error {
	if s.beforeAck != nil {
		if err := s.beforeAck(item); err != nil {
			return err
		}
	}
	s.acked++
	return nil
}
func streamFixtureItem() polymorfa.EventStreamItem {
	return polymorfa.EventStreamItem{Cursor: "c1", StreamID: "stream", Sequence: 1, Webhook: &polymorfa.WebhookEvent{ID: "event", Session: "session", Timestamp: "2026-10-01T00:00:00Z", Event: "message.received", Payload: json.RawMessage(`{"id":"m","conversation":{"id":"chat"},"timestamp":"1720000000","text":"fixture","type":"text"}`)}}
}
func TestSyncEventCheckpointManualACKAndDurableResume(t *testing.T) {
	ctx := context.Background()
	e := engineFor(t, memoryFor(t, 3), EngineOptions{})
	s := &sourceFixture{items: []polymorfa.EventStreamItem{streamFixtureItem()}}
	s.beforeAck = func(item polymorfa.EventStreamItem) error {
		has, err := e.HasEvent(ctx, "session", "event")
		if err != nil || !has {
			return errors.New("ACK preceded event commit")
		}
		saved, err := e.GetCheckpoint(ctx, "*", "events")
		if err != nil || saved == nil || saved.Cursor != item.Cursor {
			return errors.New("ACK preceded checkpoint commit")
		}
		return nil
	}
	if err := SyncToStorage(ctx, s, e, SyncOptions{Params: polymorfa.EventStreamParams{Since: "initial"}}); err != nil {
		t.Fatal(err)
	}
	if s.acked != 1 || s.params.Ack != "manual" || s.params.Since != "initial" {
		t.Fatal("initial manual source")
	}
	if err := SyncToStorage(ctx, s, e, SyncOptions{Params: polymorfa.EventStreamParams{Since: "ignored"}}); err != nil {
		t.Fatal(err)
	}
	if s.params.Since != "c1" || s.acked != 2 {
		t.Fatal("durable resume")
	}
}
func TestSyncMissingPayloadGapAndCheckpointConflictNeverACK(t *testing.T) {
	for _, mode := range []string{"missing", "gap", "checkpoint", "decode"} {
		t.Run(mode, func(t *testing.T) {
			ctx := context.Background()
			e := engineFor(t, memoryFor(t, 3), EngineOptions{})
			item := streamFixtureItem()
			s := &sourceFixture{items: []polymorfa.EventStreamItem{item}}
			options := SyncOptions{}
			switch mode {
			case "missing":
				s.items[0].Webhook = nil
			case "gap":
				s.gap = true
			case "checkpoint":
				options.Apply.DecodeHistory = nil
				s.items[0].Webhook.Event = "history.sync"
				s.items[0].Webhook.Payload = json.RawMessage(`{"syncType":"RECENT"}`)
				options.Apply.DecodeHistory = func(ctx context.Context, p map[string]any, event polymorfa.WebhookEvent) (map[string]any, error) {
					_, err := e.Apply(ctx, Batch{SessionID: "*", Operations: []Operation{{Kind: "checkpoint", SessionID: "*", Stream: "events", Cursor: "other"}}})
					return nil, err
				}
			case "decode":
				s.items[0].Webhook.Event = "history.sync"
				options.Apply.DecodeHistory = func(context.Context, map[string]any, polymorfa.WebhookEvent) (map[string]any, error) {
					return nil, errors.New("decode failed")
				}
			}
			if err := SyncToStorage(ctx, s, e, options); err == nil {
				t.Fatal("failure accepted")
			}
			if s.acked != 0 {
				t.Fatal("failed operation ACKed")
			}
			saved, err := e.GetCheckpoint(ctx, "*", "events")
			if err != nil {
				t.Fatal(err)
			}
			if mode != "checkpoint" && saved != nil {
				t.Fatal("failure advanced checkpoint")
			}
			if mode == "checkpoint" && (saved == nil || saved.Cursor != "other") {
				t.Fatal("checkpoint CAS clobbered concurrent cursor")
			}
		})
	}
}
func TestSyncActualNativeAPIStreamPersistsBeforeACK(t *testing.T) {
	e := engineFor(t, memoryFor(t, 3), EngineOptions{})
	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()
	item := streamFixtureItem()
	raw, _ := json.Marshal(item.Webhook)
	var acked atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Method == "POST" {
			saved, err := e.GetCheckpoint(context.Background(), "*", "events")
			has, _ := e.HasEvent(context.Background(), "session", "event")
			if err != nil || saved == nil || saved.Cursor != "c1" || !has {
				t.Error("native ACK preceded durable state")
			}
			if r.URL.Path != "/platform/projects/p/events/stream/stream/ack" {
				t.Error("ack path")
			}
			w.Header().Set("Content-Type", "application/json")
			fmt.Fprint(w, `{"success":true,"data":{"streamId":"stream","acknowledgedCursor":"c1","sequence":1,"replayed":false}}`)
			acked.Add(1)
			return
		}
		if r.URL.Query().Get("ack") != "manual" || r.Header.Get("Last-Event-ID") != "" {
			t.Error("native source resume/manual")
		}
		w.Header().Set("Content-Type", "text/event-stream")
		fmt.Fprintf(w, "data: {\"type\":\"event\",\"cursor\":\"c1\",\"streamId\":\"stream\",\"sequence\":1,\"event\":{\"id\":\"metadata\",\"payload\":{\"data\":%q}}}\n\n", base64.StdEncoding.EncodeToString(raw))
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer server.Close()
	key := polymorfa.Credential{Kind: polymorfa.OrganizationAPIKey, Value: "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"}
	client, err := polymorfa.NewOrganizationClient(polymorfa.Config{Credential: key, BaseURL: server.URL})
	if err != nil {
		t.Fatal(err)
	}
	project, err := client.Project("p")
	if err != nil {
		t.Fatal(err)
	}
	options := SyncOptions{OnApplied: func(polymorfa.EventStreamItem, ApplyResult) error { cancel(); return nil }}
	bounded, stop := context.WithTimeout(ctx, 3*time.Second)
	defer stop()
	err = SyncToStorage(bounded, APIEventSource{project.Events()}, e, options)
	if !errors.Is(err, context.Canceled) || acked.Load() != 1 {
		t.Fatal("native event storage ACK", err, acked.Load())
	}
}

func TestSyncInvalidStreamPayloadNeverPassesDurableCursor(t *testing.T) {
	for _, malformed := range []string{"%%%", base64.StdEncoding.EncodeToString([]byte(`{}`))} {
		t.Run(malformed, func(t *testing.T) {
			ctx := context.Background()
			e := engineFor(t, memoryFor(t, 3), EngineOptions{})
			item := streamFixtureItem()
			raw, _ := json.Marshal(item.Webhook)
			requests, acknowledgements := 0, 0
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method == "POST" {
					acknowledgements++
					saved, _ := e.GetCheckpoint(ctx, "*", "events")
					has, _ := e.HasEvent(ctx, "session", "event")
					if saved == nil || saved.Cursor != "c1" || !has {
						t.Error("ACK before durable event and checkpoint")
					}
					w.Header().Set("Content-Type", "application/json")
					fmt.Fprint(w, `{"data":{"streamId":"stream","acknowledgedCursor":"c1","sequence":1}}`)
					return
				}
				requests++
				w.Header().Set("Content-Type", "text/event-stream")
				if requests == 1 {
					if r.Header.Get("Last-Event-ID") != "initial" {
						t.Error("lost initial cursor")
					}
					fmt.Fprintf(w, "data: {\"type\":\"event\",\"cursor\":\"c1\",\"streamId\":\"stream\",\"sequence\":1,\"event\":{\"payload\":{\"data\":%q}}}\n\n", base64.StdEncoding.EncodeToString(raw))
					fmt.Fprintf(w, "data: {\"type\":\"event\",\"cursor\":\"bad\",\"streamId\":\"stream\",\"sequence\":2,\"event\":{\"payload\":{\"data\":%q}}}\n\n", malformed)
				} else {
					saved, _ := e.GetCheckpoint(ctx, "*", "events")
					if requests != 2 || r.Header.Get("Last-Event-ID") != "c1" || saved == nil || saved.Cursor != "c1" {
						t.Error("invalid payload advanced resume/checkpoint", r.Header, saved)
					}
					fmt.Fprint(w, "data: {\"type\":\"revoked\"}\n\n")
				}
			}))
			defer server.Close()
			client, _ := polymorfa.NewOrganizationClient(polymorfa.Config{Credential: polymorfa.Credential{Kind: polymorfa.OrganizationAPIKey, Value: "pmfa_" + strings.Repeat("a", 72)}, BaseURL: server.URL})
			project, _ := client.Project("p")
			err := SyncToStorage(ctx, APIEventSource{project.Events()}, e, SyncOptions{Params: polymorfa.EventStreamParams{Since: "initial", InitialDelay: time.Millisecond, MaxDelay: time.Millisecond}})
			saved, _ := e.GetCheckpoint(ctx, "*", "events")
			if err == nil || requests != 2 || acknowledgements != 1 || saved == nil || saved.Cursor != "c1" {
				t.Fatal(err, requests, acknowledgements, saved)
			}
		})
	}
}
