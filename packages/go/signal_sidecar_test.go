package polymorfa

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func signalGolden(t *testing.T) map[string]string {
	t.Helper()
	data, err := os.ReadFile("testdata/signal-sidecar.json")
	if err != nil {
		t.Fatal(err)
	}
	var raw map[string]any
	if json.Unmarshal(data, &raw) != nil {
		t.Fatal("Signal fixture")
	}
	out := map[string]string{}
	for key, value := range raw {
		if s, ok := value.(string); ok {
			out[key] = s
		}
	}
	return out
}
func signalClient(t *testing.T, endpoint, secret string) *SignalSidecarClient {
	t.Helper()
	client, err := NewSignalSidecarClient(SignalSidecarOptions{URL: endpoint, Secret: secret, Timeout: 100 * time.Millisecond})
	if err != nil {
		t.Fatal(err)
	}
	return client
}
func TestNativeSignalHTTPAndExplicitSSEAck(t *testing.T) {
	v := signalGolden(t)
	var acks atomic.Int32
	var requests atomic.Int32
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		requests.Add(1)
		if r.Header.Get("Polymorfa-Version") != "" || r.Header.Get("Origin") != "" || r.Header.Get("Cookie") != "" || r.Header.Get("Last-Event-ID") != "" {
			t.Error("Signal custody/header isolation")
		}
		w.Header().Set("Content-Type", "application/json")
		if r.URL.Path == "/healthz" {
			if r.Header.Get("Authorization") != "" {
				t.Error("health leaked application bearer")
			}
			io.WriteString(w, `{"status":"ok"}`)
			return
		}
		if r.Header.Get("Authorization") != "Bearer "+v["secret"] {
			t.Error("application bearer")
		}
		switch r.URL.Path {
		case "/v1/sessions":
			io.WriteString(w, `{"node_id":"node-fixture","sessions":[{"id":"session-fixture","lease_generation":7,"claimed":true,"has_device_keys":true,"state":"connected","pn":null,"lid":null}]}`)
		case "/v1/sessions/session-fixture/messages":
			var body map[string]any
			json.NewDecoder(r.Body).Decode(&body)
			if body["to"] != "target@lid" {
				t.Error("send target")
			}
			if media, ok := body["media"].(map[string]any); ok {
				if media["kind"] != "audio" || media["ptt"] != true || len(media["media_key"].(string)) != 44 || media["direct_path"] != "/fixture/path" {
					t.Error("sidecar media wire")
				}
			} else if body["text"] != "fixture" {
				t.Error("send text")
			}
			io.WriteString(w, `{"message_id":"sent-fixture","server_timestamp":1720000000,"resent":false}`)
		case "/v1/events":
			if r.URL.Query().Get("session_id") != "session-fixture" {
				t.Error("SSE filter")
			}
			w.Header().Set("Content-Type", "text/event-stream")
			w.(http.Flusher).Flush()
			for _, part := range []string{": keepalive\r", "\nid: event-fixture\r\nevent: message\r\ndata: ", v["rawBody"], "\r\n\r\n"} {
				io.WriteString(w, part)
				w.(http.Flusher).Flush()
			}
			<-r.Context().Done()
		case "/v1/events/event-fixture/ack":
			if acks.Add(1) > 1 {
				w.WriteHeader(404)
			} else {
				w.WriteHeader(204)
			}
		default:
			t.Error("unexpected Signal route")
			w.WriteHeader(404)
		}
	}))
	defer server.Close()
	client := signalClient(t, server.URL, v["secret"])
	ctx := context.Background()
	if err := client.Health(ctx); err != nil {
		t.Fatal(err)
	}
	sessions, err := client.Sessions(ctx)
	if err != nil || sessions.Sessions[0].LeaseGeneration != 7 {
		t.Fatal("typed sessions", err)
	}
	text := "fixture"
	if outcome, err := client.Send(ctx, "session-fixture", SignalSendRequest{To: "target@lid", Text: &text}); err != nil || outcome.ServerTimestamp != 1720000000 {
		t.Fatal("text send", err)
	}
	info, err := EncryptWhatsAppMedia(ctx, []byte("fixture"), EncryptMediaOptions{MediaType: UploadVoiceNote, MediaKey: bytes.Repeat([]byte{1}, 32), MimeType: "audio/ogg"})
	if err != nil {
		t.Fatal(err)
	}
	media, err := ToSignalMediaDescriptor(WhatsAppMediaUploadResult{EncryptedMediaInfo: info.EncryptedMediaInfo, WhatsAppUploadLocation: WhatsAppUploadLocation{DirectPath: "/fixture/path", URL: "https://cdn.whatsapp.net/fixture/path"}})
	if err != nil {
		t.Fatal(err)
	}
	if _, err := client.Send(ctx, "session-fixture", SignalSendRequest{To: "target@lid", Media: &media}); err != nil {
		t.Fatal("media send", err)
	}
	stream, err := client.OpenEvents(ctx, "session-fixture")
	if err != nil {
		t.Fatal(err)
	}
	count := 0
	for event, err := range stream.Items() {
		if err != nil {
			t.Fatal(err)
		}
		count++
		if event.ID != "event-fixture" || event.SenderAlt == nil || *event.SenderAlt != "alternate@lid" || event.Timestamp != 1720000000 || !bytes.Equal(event.RawJSON, []byte(v["rawBody"])) || acks.Load() != 0 {
			t.Fatal("SSE metadata/raw body or automatic ACK")
		}
		encoded, _ := json.Marshal(event)
		if string(encoded) != `{"redacted":true}` || strings.Contains(fmt.Sprintf("%#v", event), "private fixture") {
			t.Fatal("event redaction")
		}
		break
	}
	if count != 1 || acks.Load() != 0 {
		t.Fatal("SSE did not deliver exactly once without ACK")
	}
	if err := client.Acknowledge(ctx, "event-fixture"); err != nil {
		t.Fatal(err)
	}
	var typed *Error
	if err := client.Acknowledge(ctx, "event-fixture"); !errors.As(err, &typed) || typed.Kind != NotFoundError {
		t.Fatal("ACK404")
	}
	before := requests.Load()
	for _, body := range []SignalSendRequest{{To: "target@lid"}, {To: "target@lid", Text: &text, Media: &media}, {Text: &text}} {
		if _, err := client.Send(ctx, "session-fixture", body); err == nil {
			t.Fatal("invalid send")
		}
	}
	if requests.Load() != before {
		t.Fatal("invalid send reached service")
	}
}
func TestSignalRedirectAndBodyTimeoutFailSafely(t *testing.T) {
	v := signalGolden(t)
	for _, mode := range []string{"redirect", "body", "headers"} {
		t.Run(mode, func(t *testing.T) {
			var calls atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls.Add(1)
				if mode == "redirect" {
					w.Header().Set("Location", "http://127.0.0.1:1/private?capability=synthetic")
					w.WriteHeader(302)
					return
				}
				if mode == "body" {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(200)
					w.(http.Flusher).Flush()
				}
				<-r.Context().Done()
			}))
			defer server.Close()
			client := signalClient(t, server.URL, v["secret"])
			var err error
			if mode == "headers" {
				_, err = client.OpenEvents(context.Background(), "")
			} else {
				_, err = client.Sessions(context.Background())
			}
			var typed *Error
			if !errors.As(err, &typed) || typed.Cause != nil && typed.Kind != TimeoutError || strings.Contains(err.Error(), "capability=") || strings.Contains(err.Error(), v["secret"]) {
				t.Fatal("unsafe sidecar failure", err)
			}
			if mode != "redirect" && typed.Kind != TimeoutError {
				t.Fatal("deadline classification", err)
			}
			if calls.Load() != 1 {
				t.Fatal("redirect/retry")
			}
		})
	}
}

type signalStoreFunc func(context.Context, SignalEvent) (bool, error)

func (f signalStoreFunc) ApplyOnce(ctx context.Context, event SignalEvent) (bool, error) {
	return f(ctx, event)
}
func TestSignalWebhookExactHMACAndDurableDedupHook(t *testing.T) {
	v := signalGolden(t)
	headers := http.Header{}
	headers.Set("Signal-Node-Signature", v["signature"])
	headers.Set("Signal-Node-Timestamp", v["timestamp"])
	headers.Set("Signal-Node-Event-Id", v["eventId"])
	seconds, _ := strconv.ParseInt(v["timestamp"], 10, 64)
	options := SignalWebhookOptions{Now: time.Unix(seconds, 0)}
	raw := []byte(v["rawBody"])
	if event, err := VerifySignalWebhook(raw, headers, v["secret"], options); err != nil || event.ID != v["eventId"] {
		t.Fatal("independent HMAC", err)
	}
	calls := 0
	store := signalStoreFunc(func(context.Context, SignalEvent) (bool, error) { calls++; return calls == 1, nil })
	for i := 0; i < 2; i++ {
		_, duplicate, err := ProcessSignalWebhook(context.Background(), raw, headers, v["secret"], options, store)
		if err != nil || duplicate != (i == 1) {
			t.Fatal("durable dedup boundary", err)
		}
	}
	for _, change := range []string{"body", "signature", "timestamp", "event-id"} {
		h := headers.Clone()
		body := bytes.Clone(raw)
		switch change {
		case "body":
			body = append(body, ' ')
		case "signature":
			h.Set("Signal-Node-Signature", strings.ToUpper(v["signature"]))
		case "timestamp":
			h.Set("Signal-Node-Timestamp", "1")
		case "event-id":
			h.Set("Signal-Node-Event-Id", "wrong")
		}
		if _, _, err := ProcessSignalWebhook(context.Background(), body, h, v["secret"], options, store); err == nil {
			t.Fatal("invalid webhook accepted")
		}
	}
	if calls != 2 {
		t.Fatal("invalid webhook reached persistence")
	}
	_, _, err := ProcessSignalWebhook(context.Background(), raw, headers, v["secret"], options, signalStoreFunc(func(context.Context, SignalEvent) (bool, error) { return false, errors.New("private store secret") }))
	if err == nil || strings.Contains(err.Error(), "private") {
		t.Fatal("persistence failure leaked")
	}
}
func TestActualSignalServiceNativeReceivePersistenceAck(t *testing.T) {
	directory := os.Getenv("POLYMORFA_SIGNAL_FIXTURE_DIRECTORY")
	if directory == "" {
		t.Skip("Opt-in actual pinned service/core fixture: set POLYMORFA_SIGNAL_FIXTURE_DIRECTORY.")
	}
	data, err := os.ReadFile(filepath.Join(directory, "metadata.json"))
	if err != nil {
		t.Fatal(err)
	}
	var metadata struct {
		URL       string `json:"url"`
		Secret    string `json:"applicationSecret"`
		SessionID string `json:"sessionId"`
		Source    string `json:"sourceCommit"`
		Synthetic bool   `json:"syntheticOnly"`
	}
	if json.Unmarshal(data, &metadata) != nil || metadata.Source != SignalSidecarSourceCommit || !metadata.Synthetic {
		t.Fatal("actual service fixture source identity")
	}
	client, err := NewSignalSidecarClient(SignalSidecarOptions{URL: metadata.URL, Secret: metadata.Secret, Timeout: 10 * time.Second})
	if err != nil {
		t.Fatal(err)
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	if err := client.Health(ctx); err != nil {
		t.Fatal("actual health", err)
	}
	sessions, err := client.Sessions(ctx)
	if err != nil || len(sessions.Sessions) != 1 || sessions.Sessions[0].ID != metadata.SessionID || !sessions.Sessions[0].Claimed || !sessions.Sessions[0].HasDeviceKeys {
		t.Fatal("actual sessions", err)
	}
	wrong, _ := NewSignalSidecarClient(SignalSidecarOptions{URL: metadata.URL, Secret: "synthetic_wrong_application_secret"})
	_, err = wrong.Sessions(ctx)
	var typed *Error
	if !errors.As(err, &typed) || typed.Status != 401 {
		t.Fatal("actual service bearer refusal", err)
	}
	req, _ := http.NewRequestWithContext(ctx, "GET", metadata.URL+"/v1/sessions", nil)
	req.Header.Set("Authorization", "Bearer "+metadata.Secret)
	req.Header.Set("Origin", "null")
	response, err := http.DefaultClient.Do(req)
	if err != nil {
		t.Fatal("actual Origin check")
	}
	response.Body.Close()
	if response.StatusCode != 403 {
		t.Fatal("actual Origin refusal")
	}
	textSend := "synthetic Go native send fixture"
	if outcome, err := client.Send(ctx, metadata.SessionID, SignalSendRequest{To: "111@s.whatsapp.net", Text: &textSend}); err != nil || outcome.MessageID == "" {
		t.Fatal("actual synthetic text send", err)
	}
	encrypted, err := EncryptWhatsAppMedia(ctx, []byte("synthetic app media"), EncryptMediaOptions{MediaType: UploadVoiceNote, MimeType: "audio/ogg"})
	if err != nil {
		t.Fatal(err)
	}
	media, err := ToSignalMediaDescriptor(WhatsAppMediaUploadResult{EncryptedMediaInfo: encrypted.EncryptedMediaInfo, WhatsAppUploadLocation: WhatsAppUploadLocation{DirectPath: "/synthetic/fixture.enc", URL: "https://cdn.whatsapp.net/synthetic/fixture.enc"}})
	if err != nil {
		t.Fatal(err)
	}
	if outcome, err := client.Send(ctx, metadata.SessionID, SignalSendRequest{To: "111@s.whatsapp.net", Media: &media}); err != nil || outcome.MessageID == "" {
		t.Fatal("actual synthetic media send", err)
	}
	before := time.Time{}
	if info, e := os.Stat(filepath.Join(directory, "receipt.json")); e == nil {
		before = info.ModTime()
	}
	messageID := fmt.Sprintf("go-native-%d", time.Now().UnixNano())
	text := "synthetic Go native sidecar fixture"
	injected := make(chan error, 1)
	go func() {
		time.Sleep(300 * time.Millisecond)
		path := filepath.Join(directory, "inject.json")
		if _, err := os.Stat(path); !os.IsNotExist(err) {
			injected <- errors.New("shared fixture injection already owned")
			return
		}
		raw, _ := json.Marshal(map[string]string{"messageId": messageID, "text": text})
		injected <- os.WriteFile(path, raw, 0600)
	}()
	stream, err := client.OpenEvents(ctx, metadata.SessionID)
	if err != nil {
		t.Fatal("actual SSE open", err)
	}
	defer stream.Close()
	if err := <-injected; err != nil {
		t.Fatal(err)
	}
	persisted := false
	for event, err := range stream.Items() {
		if err != nil {
			t.Fatal("actual SSE event", err)
		}
		if event.MessageID != messageID || event.Text == nil || *event.Text != text || event.Timestamp != 1720000000 || event.SenderAlt == nil || *event.SenderAlt != "123456@lid" || !bytes.Contains(event.MessageProto, []byte(text)) {
			t.Fatal("actual native plaintext/protobuf/stanza metadata")
		}
		root := filepath.Join(filepath.Dir(directory), "go-signal-sidecar-proof")
		if os.MkdirAll(root, 0700) != nil {
			t.Fatal("proof directory")
		}
		sum := sha256.Sum256([]byte(event.ID))
		path := filepath.Join(root, hex.EncodeToString(sum[:])+".json")
		file, err := os.OpenFile(path, os.O_WRONLY|os.O_CREATE|os.O_EXCL, 0600)
		if err != nil {
			t.Fatal("caller durable file")
		}
		if _, err = file.Write(event.RawJSON); err == nil {
			err = file.Sync()
		}
		closeErr := file.Close()
		if err != nil || closeErr != nil {
			t.Fatal("caller fsync")
		}
		parent, err := os.Open(root)
		if err != nil {
			t.Fatal(err)
		}
		err = parent.Sync()
		parent.Close()
		if err != nil {
			t.Fatal("caller directory fsync")
		}
		persisted = true
		if err = client.Acknowledge(ctx, event.ID); err != nil {
			t.Fatal("manual actual ACK", err)
		}
		if err = client.Acknowledge(ctx, event.ID); !errors.As(err, &typed) || typed.Status != 404 {
			t.Fatal("actual duplicate ACK must be404", err)
		}
		break
	}
	if !persisted {
		t.Fatal("actual event was not persisted")
	}
	for deadline := time.Now().Add(6 * time.Second); time.Now().Before(deadline); {
		info, err := os.Stat(filepath.Join(directory, "receipt.json"))
		if err == nil && info.ModTime().After(before) {
			raw, _ := os.ReadFile(filepath.Join(directory, "receipt.json"))
			var receipt struct {
				Ack bool `json:"acknowledged"`
			}
			if json.Unmarshal(raw, &receipt) == nil && receipt.Ack {
				t.Log("Actual pinned service/core encrypted Receive -> native plaintext/protobuf -> fsynced caller file -> explicit ACK -> acknowledged receipt passed.")
				return
			}
		}
		time.Sleep(20 * time.Millisecond)
	}
	t.Fatal("actual service did not confirm ACK")
}

func TestSignalSSEBodyCancellationAndFrameIdentity(t *testing.T) {
	v := signalGolden(t)
	for _, mode := range []string{"cancel", "id", "type", "session"} {
		t.Run(mode, func(t *testing.T) {
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				w.Header().Set("Content-Type", "text/event-stream")
				w.WriteHeader(200)
				w.(http.Flusher).Flush()
				if mode == "cancel" {
					<-r.Context().Done()
					return
				}
				id, kind := v["eventId"], "message"
				body := v["rawBody"]
				if mode == "id" {
					id = "wrong"
				}
				if mode == "type" {
					kind = "history.sync"
				}
				if mode == "session" {
					body = strings.Replace(body, "session-fixture", "foreign-session", 1)
				}
				fmt.Fprintf(w, "id: %s\nevent: %s\ndata: %s\n\n", id, kind, body)
				w.(http.Flusher).Flush()
				<-r.Context().Done()
			}))
			defer server.Close()
			client := signalClient(t, server.URL, v["secret"])
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			stream, err := client.OpenEvents(ctx, "session-fixture")
			if err != nil {
				t.Fatal(err)
			}
			if mode == "cancel" {
				time.AfterFunc(20*time.Millisecond, cancel)
			}
			seen := false
			for _, err := range stream.Items() {
				var typed *Error
				if !errors.As(err, &typed) {
					t.Fatal("invalid stream frame/cancellation was delivered", err)
				}
				if mode == "cancel" && typed.Kind != CancelledError {
					t.Fatal("body cancellation", err)
				}
				if mode != "cancel" && typed.Code != "signal_sidecar_invalid_response" {
					t.Fatal("SSE envelope identity", err)
				}
				seen = true
				break
			}
			if !seen {
				t.Fatal("missing stream failure")
			}
		})
	}
}
func TestSignalEventHistoryAndCanonicalBase64Shapes(t *testing.T) {
	v := signalGolden(t)
	var fields map[string]any
	json.Unmarshal([]byte(v["rawBody"]), &fields)
	fields["type"] = "history.sync"
	fields["message_proto"] = ""
	fields["history"] = map[string]any{"notification_proto": "CgA=", "sync_type": float64(6), "media_key": nil, "direct_path": nil}
	raw, _ := json.Marshal(fields)
	event, err := parseSignalEvent(raw)
	if err != nil || event.History.SyncType == nil || *event.History.SyncType != 6 {
		t.Fatal("nullable integer history enum", err)
	}
	fields["history"].(map[string]any)["sync_type"] = "RECENT"
	raw, _ = json.Marshal(fields)
	if _, err := parseSignalEvent(raw); err == nil {
		t.Fatal("string history enum accepted")
	}
	for _, proto := range []any{"CgA=\n", []int{10, 0}, nil} {
		fields["type"] = "message"
		delete(fields, "history")
		fields["message_proto"] = proto
		raw, _ = json.Marshal(fields)
		if _, err := parseSignalEvent(raw); err == nil {
			t.Fatal("noncanonical protobuf base64 accepted")
		}
	}
}
