package polymorfa

import (
	"bytes"
	"context"
	"encoding/base64"
	"encoding/json"
	"errors"
	"net/http"
	"testing"
)

func TestNativeHistoryRetryDeleteWire(t *testing.T) {
	calls := 0
	sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		var body map[string]any
		json.NewDecoder(r.Body).Decode(&body)
		if r.Method != "POST" || r.Header.Get("Authorization") == "" {
			t.Error("history server credential/method")
		}
		if calls == 1 {
			if r.URL.Path != "/messaging/session/history/chunks/retry" || r.Header.Get("Polymorfa-Version") != CustomerOwnedAPIVersion || body["syncType"] != "RECENT" || body["chunkOrder"] != float64(1<<32-1) || body["regenerate"] != false || body["chunkMessageId"] != "fixture_message" {
				t.Error("retry exact wire")
			}
			w.Write([]byte(`{"success":true,"data":{"requestId":"fixture_retry","status":"requested"}}`))
		} else {
			if r.URL.Path != "/messaging/session/history/media/delete" || r.Header.Get("Polymorfa-Version") != "2026-12-01" || body["directPath"] != "/fixture/history?ccb=1" || body["fileEncSha256"] != base64.StdEncoding.EncodeToString(bytes.Repeat([]byte{255}, 32)) || body["encHandle"] != "handle" || body["companionMetaNonce"] != "nonce" {
				t.Error("delete standard-base64 wire/version")
			}
			w.Write([]byte(`{"success":true,"data":{"status":"deleted"}}`))
		}
	})
	no := false
	retry, err := sdk.HistorySync().RequestChunkRetry(context.Background(), "session", HistorySyncChunkRetryRequest{SyncType: HistoryRecent, ChunkOrder: ^uint32(0), ChunkMessageID: "fixture_message", Regenerate: &no})
	if err != nil || retry.Data.Data.RequestID != "fixture_retry" {
		t.Fatal("retry", err)
	}
	deletion, err := sdk.HistorySync().DeleteChunk(context.Background(), "session", HistorySyncChunkDeleteRequest{DirectPath: "/fixture/history?ccb=1", FileEncSHA256: bytes.Repeat([]byte{255}, 32), EncHandle: "handle", CompanionMetaNonce: "nonce"}, RequestOptions{APIVersion: "2026-12-01"})
	if err != nil || deletion.Data.Data.Status != "deleted" || calls != 2 {
		t.Fatal("delete", err)
	}
}
func TestHistoryCommandsNoAutomaticRetriesAndLocalValidation(t *testing.T) {
	calls := 0
	sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
		calls++
		w.WriteHeader(503)
		w.Write([]byte(`{"error":{"code":"service_unavailable"}}`))
	})
	_, err := sdk.HistorySync().RequestChunkRetry(context.Background(), "session", HistorySyncChunkRetryRequest{SyncType: HistoryFull})
	if err == nil || calls != 1 {
		t.Fatal("retry command replayed automatically")
	}
	_, err = sdk.HistorySync().DeleteChunk(context.Background(), "session", HistorySyncChunkDeleteRequest{DirectPath: "/fixture", FileEncSHA256: make([]byte, 32)})
	if err == nil || calls != 2 {
		t.Fatal("delete command replayed automatically")
	}
	for _, b := range []HistorySyncChunkRetryRequest{{SyncType: "INVALID"}, {SyncType: HistoryFull, ChunkMessageID: "private\nvalue"}} {
		if _, err := sdk.HistorySync().RequestChunkRetry(context.Background(), "session", b); err == nil {
			t.Fatal("invalid retry accepted")
		}
	}
	for _, b := range []HistorySyncChunkDeleteRequest{{DirectPath: "https://private.invalid", FileEncSHA256: make([]byte, 32)}, {DirectPath: "/fixture", FileEncSHA256: make([]byte, 31)}, {DirectPath: "/fixture", FileEncSHA256: make([]byte, 32), EncHandle: "private\nvalue"}} {
		if _, err := sdk.HistorySync().DeleteChunk(context.Background(), "session", b); err == nil {
			t.Fatal("invalid delete accepted")
		}
	}
	if calls != 2 {
		t.Fatal("invalid history command reached network")
	}
	browser := &MessagingClient{t: &transport{config: Config{Credential: Credential{Kind: ClientToken, Value: "pmfa_ct_Zml4dHVyZQ"}}}}
	_, err = browser.HistorySync().RequestChunkRetry(context.Background(), "session", HistorySyncChunkRetryRequest{SyncType: HistoryFull})
	var typed *Error
	if !errors.As(err, &typed) || typed.Kind != ConfigurationError {
		t.Fatal("client token reached history retry", err)
	}
	_, err = browser.HistorySync().DeleteChunk(context.Background(), "session", HistorySyncChunkDeleteRequest{DirectPath: "/fixture", FileEncSHA256: make([]byte, 32)})
	if !errors.As(err, &typed) || typed.Kind != ConfigurationError {
		t.Fatal("client token reached history delete", err)
	}
}
func TestHistoryCommandMalformedResponse(t *testing.T) {
	sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte(`{"success":true,"data":{"status":"requested"}}`))
	})
	_, err := sdk.HistorySync().RequestChunkRetry(context.Background(), "session", HistorySyncChunkRetryRequest{SyncType: HistoryFull})
	var typed *Error
	if !errors.As(err, &typed) || typed.Code != "invalid_response" {
		t.Fatal("malformed retry response", err)
	}
}
