package polymorfa_test

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	sdk "github.com/polymorfa/sdks/packages/go"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
)

// A caller key does not add a producer replay ledger to these held routes.
func TestUnledgeredSubmissions(t *testing.T) {
	for _, warmed := range []bool{false, true} {
		for _, operation := range []string{"grant", "relay", "retry", "delete"} {
			for _, status := range []int{0, 429, 503} {
				for _, policy := range []string{"keyed", "unkeyed", "default"} {
					t.Run(fmt.Sprintf("%s/%d/%s/warmed=%t", operation, status, policy, warmed), func(t *testing.T) {
						var count, opens, closes atomic.Int32
						server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
							body, _ := io.ReadAll(r.Body)
							if strings.HasSuffix(r.URL.Path, "/profile") {
								w.Header().Set("Content-Type", "application/json")
								io.WriteString(w, `{ "success":true,"data":{}}`)
								return
							}
							count.Add(1)
							if r.Header.Get("Authorization") == "" || r.Header.Get("X-Caller") != "retained" || r.Header.Get("Polymorfa-Version") != "2026-10-14" {
								t.Error("caller headers/version lost")
							}
							wantKey := ""
							if policy == "keyed" {
								wantKey = "caller-key"
							}
							if r.Header.Get("Idempotency-Key") != wantKey {
								t.Error("caller key changed")
							}
							if operation == "relay" && len(body) != 26 {
								t.Error("ciphertext length")
							}
							if status == 0 {
								conn, _, err := w.(http.Hijacker).Hijack()
								if err != nil {
									t.Error(err)
									return
								}
								conn.Close()
								return
							}
							w.Header().Set("Content-Type", "application/json")
							w.Header().Set("Retry-After", "0")
							w.Header().Set("X-Request-Id", "unledgered")
							w.WriteHeader(status)
							io.WriteString(w, `{"error":{"code":"fixture_failure","message":"unknown outcome"}}`)
						}))
						defer server.Close()
						one := 1
						client, err := sdk.NewMessagingClient(sdk.Config{Credential: sdk.Credential{Kind: sdk.OrganizationAPIKey, Value: "pmfa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, BaseURL: server.URL, MaxNetworkRetries: &one})
						if err != nil {
							t.Fatal(err)
						}
						// Reuse a live connection: net/http can replay keyed JSON below the SDK loop.
						if warmed {
							if _, err := client.Profile().Get(context.Background(), "s"); err != nil {
								t.Fatal(err)
							}
						}
						options := sdk.RequestOptions{Headers: http.Header{"X-Caller": []string{"retained"}}}
						if policy != "default" {
							options.MaxNetworkRetries = &one
						}
						if policy == "keyed" {
							options.IdempotencyKey = "caller-key"
						}
						ctx := context.Background()
						switch operation {
						case "grant":
							_, err = client.WhatsAppMedia().CreateUploadGrant(ctx, "s", sdk.UploadImage, make([]byte, 32), options)
						case "relay":
							_, err = client.WhatsAppMedia().RelayUpload(ctx, "s", sdk.EncryptedMediaInfo{MediaType: sdk.UploadImage, FileEncSHA256: make([]byte, 32), EncryptedLength: 26}, func(context.Context) (io.ReadCloser, error) {
								opens.Add(1)
								return &unledgeredBody{Reader: bytes.NewReader(make([]byte, 26)), close: func() { closes.Add(1) }}, nil
							}, options)
						case "retry":
							_, err = client.HistorySync().RequestChunkRetry(ctx, "s", sdk.HistorySyncChunkRetryRequest{SyncType: sdk.HistoryRecent, ChunkOrder: 1}, options)
						case "delete":
							_, err = client.HistorySync().DeleteChunk(ctx, "s", sdk.HistorySyncChunkDeleteRequest{DirectPath: "/chunk", FileEncSHA256: make([]byte, 32)}, options)
						}
						var apiError *sdk.Error
						if !errors.As(err, &apiError) {
							t.Fatalf("expected SDK error, got %v", err)
						}
						if count.Load() != 1 {
							t.Errorf("unledgered submission repeated: %d", count.Load())
						}
						if status != 0 && (apiError.Status != status || apiError.Code != "fixture_failure" || apiError.RequestID != "unledgered" || apiError.Metadata.Attempts != 1) {
							t.Errorf("metadata lost: %+v", apiError)
						}
						if status == 0 && apiError.Kind != sdk.ConnectionError {
							t.Errorf("connection failure lost: %v", err)
						}
						if operation == "relay" && (opens.Load() != 1 || closes.Load() != 1) {
							t.Errorf("body ownership opens=%d closes=%d", opens.Load(), closes.Load())
						}
					})
				}
			}
		}
	}
}

type unledgeredBody struct {
	*bytes.Reader
	close func()
}

func (b *unledgeredBody) Close() error { b.close(); return nil }

func TestUnledgeredEstablishedRetryControls(t *testing.T) {
	for _, operation := range []string{"send", "get"} {
		t.Run(operation, func(t *testing.T) {
			var count atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				io.Copy(io.Discard, r.Body)
				n := count.Add(1)
				w.Header().Set("Content-Type", "application/json")
				if n == 1 {
					w.Header().Set("Retry-After", "0")
					w.WriteHeader(503)
					io.WriteString(w, `{"error":{"code":"busy"}}`)
					return
				}
				io.WriteString(w, `{"success":true,"data":{"id":"message","status":"sent"}}`)
			}))
			defer server.Close()
			one := 1
			client, err := sdk.NewMessagingClient(sdk.Config{Credential: sdk.Credential{Kind: sdk.OrganizationAPIKey, Value: "pmfa_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"}, BaseURL: server.URL, MaxNetworkRetries: &one})
			if err != nil {
				t.Fatal(err)
			}
			options := sdk.RequestOptions{IdempotencyKey: "send-key", MaxNetworkRetries: &one}
			text := "fixture"
			if operation == "send" {
				_, err = client.Messages().Send(context.Background(), "s", sdk.SendMessageRequest{Conversation: sdk.ConversationReference{PhoneNumber: "+15550001111"}, Content: sdk.MessageContent{Text: &text}}, options)
			} else {
				_, err = client.Profile().Get(context.Background(), "s", options)
			}
			if err != nil || count.Load() != 2 {
				t.Fatalf("established retry changed count=%d error=%v", count.Load(), err)
			}
		})
	}
}
