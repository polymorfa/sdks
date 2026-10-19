package polymorfa_test

import (
	"bytes"
	"compress/gzip"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/base64"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"testing"
	"time"

	sdk "github.com/polymorfa/sdks/packages/go"
	s "github.com/polymorfa/sdks/packages/go/storage"
)

func descriptorFixture(t *testing.T) map[string]json.RawMessage {
	t.Helper()
	b, e := os.ReadFile("testdata/descriptor-storage/fixture.json")
	if e != nil {
		t.Fatal(e)
	}
	var f map[string]json.RawMessage
	if e = json.Unmarshal(b, &f); e != nil {
		t.Fatal(e)
	}
	return f
}
func TestDescriptorStorageMissingDecoder(t *testing.T) {
	a, _ := s.NewMemoryAdapter(1000)
	e, _ := s.NewEngine(a, s.EngineOptions{})
	ev := sdk.WebhookEvent{ID: "descriptor-event", Session: "descriptor-session", Timestamp: "2026-10-17T00:00:00Z", Event: "history.sync", Payload: descriptorFixture(t)["inline"]}
	_, err := e.ApplyEvent(context.Background(), ev, s.ApplyEventOptions{})
	if err == nil {
		t.Fatal("undecoded descriptor consumed")
	}
	marked, _ := e.HasEvent(context.Background(), ev.Session, ev.ID)
	if marked {
		t.Fatal("failure marked")
	}
}
func descriptorRows(t *testing.T, e *s.Engine, entity string) []s.Row {
	t.Helper()
	key := map[string]any{"sessionId": "descriptor-session", "syncType": "RECENT"}
	if entity == "messages" {
		key = map[string]any{"sessionId": "descriptor-session", "messageId": "wa:fixture-user@s.whatsapp.net:0::native-history-message"}
	}
	row, err := e.Get(context.Background(), entity, key)
	if err != nil {
		t.Fatal(err)
	}
	if row == nil {
		return nil
	}
	return []s.Row{row}
}
func TestDescriptorStoragePublicMatrix(t *testing.T) {
	ctx := context.Background()
	f := descriptorFixture(t)
	for _, branch := range []string{"media", "inline"} {
		for _, mode := range []string{"missing", "archive", "null", "error", "invalid", "metadata", "metadata-decoder", "empty", "full"} {
			t.Run(branch+"/"+mode, func(t *testing.T) {
				a, _ := s.NewMemoryAdapter(1000)
				e, _ := s.NewEngine(a, s.EngineOptions{})
				ev := sdk.WebhookEvent{ID: "descriptor-event", Session: "descriptor-session", Timestamp: "2026-10-17T00:00:00Z", Event: "history.sync", Payload: f[branch]}
				raw, _ := json.Marshal(ev)
				mac := hmac.New(sha256.New, []byte("synthetic-secret"))
				mac.Write(raw)
				ev, err := sdk.ConstructWebhookEvent(raw, hex.EncodeToString(mac.Sum(nil)), "synthetic-secret")
				if err != nil {
					t.Fatal(err)
				}
				calls := 0
				opts := s.ApplyEventOptions{}
				var chunk map[string]any
				json.Unmarshal(f["chunk"], &chunk)
				switch mode {
				case "archive":
					opts.DecodeHistory = func(context.Context, map[string]any, sdk.WebhookEvent) (map[string]any, error) {
						calls++
						return nil, nil
					}
				case "metadata", "metadata-decoder":
					opts.HistoryDescriptorMode = s.DescriptorMetadataOnly
					opts.DecodeHistoryDescriptor = func(context.Context, map[string]any, sdk.WebhookEvent) (map[string]any, error) {
						calls++
						return nil, errors.New("must skip")
					}
				case "null", "error", "invalid", "empty", "full":
					opts.DecodeHistoryDescriptor = func(c context.Context, p map[string]any, original sdk.WebhookEvent) (map[string]any, error) {
						calls++
						if p["delivery"] != "descriptor" || original.ID != ev.ID {
							t.Fatal("callback args")
						}
						switch mode {
						case "null":
							return nil, nil
						case "error":
							return nil, errors.New("synthetic-key-secret")
						case "invalid":
							return map[string]any{"conversations": "bad"}, nil
						case "empty":
							return map[string]any{}, nil
						}
						if branch == "inline" {
							var d struct {
								Inline struct {
									Data string `json:"data"`
								}
							}
							json.Unmarshal(ev.Payload, &d)
							b, _ := base64.StdEncoding.DecodeString(d.Inline.Data)
							decoded, err := sdk.DecodeHistorySyncPayload(c, b, sdk.DecodeHistorySyncOptions{Decoder: func(context.Context, []byte) (any, error) { return chunk, nil }})
							if err != nil || decoded.Decoded == nil {
								t.Fatal("verified full schema/application projection", err)
							}
						}
						return chunk, nil
					}
				}
				_, err = e.ApplyEvent(ctx, ev, opts)
				fail := mode == "missing" || mode == "archive" || mode == "null" || mode == "error" || mode == "invalid"
				if (err != nil) != fail {
					t.Fatalf("outcome %v", err)
				}
				if err != nil && strings.Contains(err.Error(), "synthetic-key-secret") {
					t.Fatal("secret error")
				}
				marked, _ := e.HasEvent(ctx, ev.Session, ev.ID)
				if marked == fail {
					t.Fatal("marker")
				}
				rows := descriptorRows(t, e, "messages")
				if (len(rows) == 1) != (mode == "full") {
					t.Fatal("content", len(rows))
				}
				if mode == "full" {
					b, _ := json.Marshal(rows)
					if !strings.Contains(string(b), "wa:") || strings.Contains(string(b), "synthetic-notification") {
						t.Fatal("identity")
					}
				}
				progress := descriptorRows(t, e, "history_progress")
				if (len(progress) > 0) == fail {
					t.Fatal("progress")
				}
				if mode == "archive" || strings.HasPrefix(mode, "metadata") {
					if calls != 0 {
						t.Fatal("wrong callback")
					}
				}
				if !fail {
					result, err := e.ApplyEvent(ctx, ev, s.ApplyEventOptions{})
					if err != nil || result.Applied {
						t.Fatal("valid duplicate decoder availability")
					}
				}
			})
		}
	}
	for _, patch := range []string{`{"delivery":null}`, `{"delivery":"bad"}`, `{"media":{}}`, `{"inline":null}`, `{"whatsapp_ids":{}}`, `{"fileLength":null}`, `{"fileLength":-1}`, `{"progress":101}`, `{"syncType":""}`, `{"oldestMessageAt":"2026-02-30T00:00:00Z"}`, `{"peerDataRequestSessionId":null}`, `{"whatsapp_id":""}`} {
		var p, change map[string]any
		json.Unmarshal(f["inline"], &p)
		json.Unmarshal([]byte(patch), &change)
		for k, v := range change {
			p[k] = v
		}
		raw, _ := json.Marshal(p)
		a, _ := s.NewMemoryAdapter(1000)
		e, _ := s.NewEngine(a, s.EngineOptions{})
		_, err := e.ApplyEvent(ctx, sdk.WebhookEvent{ID: "bad", Session: "descriptor-session", Event: "history.sync", Payload: raw}, s.ApplyEventOptions{HistoryDescriptorMode: s.DescriptorMetadataOnly})
		if err == nil {
			t.Fatal("malformed consumed", patch)
		}
	}
}
func TestDescriptorStorageHTTP(t *testing.T) {
	f := descriptorFixture(t)
	for _, branch := range []string{"inline", "media"} {
		for _, mode := range []string{"missing", "null", "metadata", "full", "conflict", "ack-error", "malformed"} {
			t.Run(branch+"/"+mode, func(t *testing.T) {
				ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
				defer cancel()
				a, _ := s.NewMemoryAdapter(1000)
				e, _ := s.NewEngine(a, s.EngineOptions{})
				payload := f[branch]
				if mode == "malformed" {
					var p map[string]any
					json.Unmarshal(payload, &p)
					p["delivery"] = nil
					payload, _ = json.Marshal(p)
				}
				ev := sdk.WebhookEvent{ID: "descriptor-event", Session: "descriptor-session", Event: "history.sync", Timestamp: "2026-10-17T00:00:00Z", Payload: payload}
				raw, _ := json.Marshal(ev)
				acked := 0
				resume := false
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.Method == "POST" {
						marked, _ := e.HasEvent(context.Background(), ev.Session, ev.ID)
						cursor, _ := e.GetCheckpoint(context.Background(), "*", "events")
						if !marked || cursor == nil || cursor.Cursor != "descriptor-cursor" {
							t.Error("ACK preceded data/checkpoint")
						}
						acked++
						if mode == "ack-error" {
							w.WriteHeader(503)
							fmt.Fprint(w, `{"error":{"type":"api_error","code":"synthetic_ack_failed","message":"fixture"}}`)
							return
						}
						w.Header().Set("Content-Type", "application/json")
						fmt.Fprint(w, `{"data":{"streamId":"fixture-stream","acknowledgedCursor":"descriptor-cursor","sequence":2,"replayed":false},"success":true}`)
						return
					}
					if r.URL.Query().Get("ack") != "manual" {
						t.Error("not manual")
					}
					if resume && r.Header.Get("Last-Event-ID") != "descriptor-cursor" {
						t.Error("resume")
					}
					if mode == "conflict" {
						e.Apply(context.Background(), s.Batch{SessionID: "*", Operations: []s.Operation{{Kind: "checkpoint", SessionID: "*", Stream: "events", Cursor: "competitor"}}})
					}
					w.Header().Set("Content-Type", "text/event-stream")
					fmt.Fprintf(w, "data: {\"type\":\"event\",\"cursor\":\"descriptor-cursor\",\"streamId\":\"fixture-stream\",\"sequence\":2,\"event\":{\"id\":\"metadata\",\"payload\":{\"data\":%q}}}\n\n", base64.StdEncoding.EncodeToString(raw))
					w.(http.Flusher).Flush()
					<-r.Context().Done()
				}))
				defer server.Close()
				client, err := sdk.NewOrganizationClient(sdk.Config{Credential: sdk.Credential{Kind: sdk.OrganizationAPIKey, Value: "pmfa_AAECAwQFBgcICQoLDA0ODxAREhM73f-k"}, BaseURL: server.URL, MaxNetworkRetries: intPtrDescriptor(0)})
				if err != nil {
					t.Fatal(err)
				}
				project, _ := client.Project("p")
				opts := s.SyncOptions{OnApplied: func(sdk.EventStreamItem, s.ApplyResult) error { cancel(); return nil }}
				if mode == "metadata" {
					opts.Apply.HistoryDescriptorMode = s.DescriptorMetadataOnly
				} else if mode != "missing" && mode != "malformed" {
					opts.Apply.DecodeHistoryDescriptor = func(context.Context, map[string]any, sdk.WebhookEvent) (map[string]any, error) {
						if mode == "null" {
							return nil, nil
						}
						var chunk map[string]any
						json.Unmarshal(f["chunk"], &chunk)
						return chunk, nil
					}
				}
				err = s.SyncToStorage(ctx, s.APIEventSource{Events: project.Events()}, e, opts)
				failed := mode == "missing" || mode == "null" || mode == "malformed"
				marked, _ := e.HasEvent(context.Background(), ev.Session, ev.ID)
				if marked == failed {
					t.Fatal("marker")
				}
				contentRows := descriptorRows(t, e, "messages")
				wantContent := mode == "full" || mode == "conflict" || mode == "ack-error"
				if (len(contentRows) == 1) != wantContent {
					t.Fatal("HTTP content")
				}
				if (len(descriptorRows(t, e, "history_progress")) > 0) == failed {
					t.Fatal("HTTP progress")
				}
				if (acked > 0) != (mode == "metadata" || mode == "full" || mode == "ack-error") {
					t.Fatal("ACK", acked, err)
				}
				if mode == "conflict" && err == nil {
					t.Fatal("conflict")
				}
				if mode == "full" || mode == "metadata" {
					resume = true
					ctx2, cancel2 := context.WithCancel(context.Background())
					defer cancel2()
					opts.Apply = s.ApplyEventOptions{}
					opts.OnApplied = func(sdk.EventStreamItem, s.ApplyResult) error { cancel2(); return nil }
					s.SyncToStorage(ctx2, s.APIEventSource{Events: project.Events()}, e, opts)
					if acked != 2 {
						t.Fatal("replay")
					}
				}
			})
		}
	}
}
func intPtrDescriptor(v int) *int { return &v }

func TestDescriptorStorageProducerIDUTF16Boundary(t *testing.T) {
	ctx := context.Background()
	f := descriptorFixture(t)
	for _, field := range []string{"whatsapp_ids", "original_whatsapp_ids", "whatsapp_id", "original_whatsapp_id"} {
		for _, units := range []int{512, 514} {
			var p map[string]any
			json.Unmarshal(f["inline"], &p)
			id := strings.Repeat("😀", units/2)
			if field == "whatsapp_ids" || field == "original_whatsapp_ids" {
				p[field] = map[string]any{"linked_devices": id}
			} else {
				p[field] = id
			}
			raw, _ := json.Marshal(p)
			a, _ := s.NewMemoryAdapter(1000)
			e, _ := s.NewEngine(a, s.EngineOptions{})
			ev := sdk.WebhookEvent{ID: "utf16", Session: "descriptor-session", Event: "history.sync", Timestamp: "2026-10-17T00:00:00Z", Payload: raw}
			_, err := e.ApplyEvent(ctx, ev, s.ApplyEventOptions{HistoryDescriptorMode: s.DescriptorMetadataOnly})
			if (err == nil) != (units == 512) {
				t.Fatalf("producer UTF16 boundary: %s units=%d accepted=%v", field, units, err == nil)
			}
			marked, _ := e.HasEvent(ctx, ev.Session, ev.ID)
			if marked != (units == 512) {
				t.Fatal("UTF16 marker")
			}
		}
	}
}

func TestDescriptorStorageArchiveCloudControls(t *testing.T) {
	ctx := context.Background()
	f := descriptorFixture(t)
	var p map[string]any
	json.Unmarshal(f["inline"], &p)
	delete(p, "delivery")
	delete(p, "inline")
	p["messages"] = []any{}
	p["mode"] = "deliver"
	for _, key := range []string{"conversationCount", "messageCount", "pushNameCount", "statusMessageCount"} {
		p[key] = 0
	}
	rawBytes, _ := base64.StdEncoding.DecodeString(string(bytes.Trim(f["protobuf"], "\"")))
	var compressed bytes.Buffer
	w := gzip.NewWriter(&compressed)
	w.Write(rawBytes)
	w.Close()
	p["fileLength"] = compressed.Len()
	p["whatsapp"] = map[string]any{"encoding": "gzip-base64-protobuf", "data": base64.StdEncoding.EncodeToString(compressed.Bytes())}
	for _, mode := range []string{"missing", "null", "full", "error", "cloud"} {
		a, _ := s.NewMemoryAdapter(1000)
		engine, _ := s.NewEngine(a, s.EngineOptions{})
		payload, _ := json.Marshal(p)
		if mode == "cloud" {
			payload = []byte(`{"kind":"history","value":{}}`)
		}
		event := sdk.WebhookEvent{ID: "archive", Session: "descriptor-session", Event: "history.sync", Timestamp: "2026-10-17T00:00:00Z", Payload: payload}
		calls := 0
		options := s.ApplyEventOptions{DecodeHistoryDescriptor: func(context.Context, map[string]any, sdk.WebhookEvent) (map[string]any, error) {
			t.Fatal("descriptor callback for archive/cloud")
			return nil, nil
		}}
		if mode != "missing" {
			options.DecodeHistory = func(_ context.Context, archive map[string]any, original sdk.WebhookEvent) (map[string]any, error) {
				calls++
				if archive["syncType"] != "RECENT" || !bytes.Equal(original.Payload, payload) {
					t.Fatal("archive callback args")
				}
				if mode == "error" {
					return nil, errors.New("archive callback failure")
				}
				if mode == "full" {
					var chunk map[string]any
					json.Unmarshal(f["chunk"], &chunk)
					return chunk, nil
				}
				return nil, nil
			}
		}
		_, err := engine.ApplyEvent(ctx, event, options)
		if (err != nil) != (mode == "error") {
			t.Fatal("archive/cloud behavior", mode, err)
		}
		if mode == "missing" || mode == "cloud" {
			if calls != 0 {
				t.Fatal("archive/cloud callback")
			}
		}
		marked, _ := engine.HasEvent(ctx, event.Session, event.ID)
		if marked != (mode != "error") {
			t.Fatal("archive marker")
		}
	}
}

func TestDescriptorStorageRejectsUnprojectedFields(t *testing.T) {
	for _, branch := range []string{"top", "inline", "media"} {
		f := descriptorFixture(t)
		name := "inline"
		if branch == "media" {
			name = "media"
		}
		var p map[string]any
		json.Unmarshal(f[name], &p)
		if branch == "top" {
			p["unprojected"] = "synthetic"
		} else {
			p[branch].(map[string]any)["unprojected"] = "synthetic"
		}
		raw, _ := json.Marshal(p)
		a, _ := s.NewMemoryAdapter(1000)
		engine, _ := s.NewEngine(a, s.EngineOptions{})
		ev := sdk.WebhookEvent{ID: "extra", Session: "descriptor-session", Event: "history.sync", Timestamp: "2026-10-17T00:00:00Z", Payload: raw}
		if _, err := engine.ApplyEvent(context.Background(), ev, s.ApplyEventOptions{HistoryDescriptorMode: s.DescriptorMetadataOnly}); err == nil {
			t.Fatal("unprojected descriptor field consumed", branch)
		}
	}
}
