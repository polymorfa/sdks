package polymorfa

import (
	"context"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
	"time"
)

func TestMediaBodyTimeoutAndCancellation(t *testing.T) {
	for _, stream := range []bool{false, true} {
		for _, cancelled := range []bool{false, true} {
			t.Run(fmt.Sprintf("stream=%v/cancelled=%v", stream, cancelled), func(t *testing.T) {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					w.Header().Set("Content-Type", "application/octet-stream")
					w.Header().Set("X-Request-Id", "body_timeout")
					w.WriteHeader(200)
					w.(http.Flusher).Flush()
					<-r.Context().Done()
				}))
				defer server.Close()
				config := orgConfig(server.URL)
				config.MaxNetworkRetries = reviewPointer(0)
				client, err := NewMessagingClient(config)
				if err != nil {
					t.Fatal(err)
				}
				ctx, cancel := context.WithCancel(context.Background())
				defer cancel()
				if cancelled {
					time.AfterFunc(20*time.Millisecond, cancel)
				}
				start := time.Now()
				opts := RequestOptions{Timeout: 60 * time.Millisecond}
				var readErr error
				if stream {
					download, err := client.Media().DownloadStream(ctx, "fixture", opts)
					if err != nil {
						t.Fatal(err)
					}
					defer download.Body.Close()
					_, readErr = io.ReadAll(download.Body)
				} else {
					_, readErr = client.Media().Download(ctx, "fixture", opts)
				}
				var typed *Error
				if !errors.As(readErr, &typed) {
					t.Fatalf("expected typed error, got %T %v", readErr, readErr)
				}
				want := TimeoutError
				if cancelled {
					want = CancelledError
				}
				if typed.Kind != want || typed.Metadata.RequestID != "body_timeout" || time.Since(start) > time.Second {
					t.Fatalf("timeout/cancel metadata: %+v", typed)
				}
			})
		}
	}
}
func TestRedirectedMediaRetainsBodyDeadlineAndCustomTransport(t *testing.T) {
	storage := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Polymorfa-Version") != "" {
			t.Error("credential crossed boundary")
		}
		w.Header().Set("Content-Type", "application/octet-stream")
		w.WriteHeader(200)
		w.(http.Flusher).Flush()
		<-r.Context().Done()
	}))
	defer storage.Close()
	api := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, storage.URL+"/signed?capability=synthetic", 302)
	}))
	defer api.Close()
	config := orgConfig(api.URL)
	config.HTTPClient = storage.Client()
	config.MaxNetworkRetries = reviewPointer(0)
	client, err := NewMessagingClient(config)
	if err != nil {
		t.Fatal(err)
	}
	_, err = client.Media().Download(context.Background(), "fixture", RequestOptions{Timeout: 60 * time.Millisecond})
	var typed *Error
	if !errors.As(err, &typed) || typed.Kind != TimeoutError {
		t.Fatalf("redirect timeout: %T %v", err, err)
	}
}
func TestBasePathPreservedForHTTPAndCallsSocket(t *testing.T) {
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.EscapedPath() != "/proxy%20base/messaging/media/a%2Fb/info" {
			t.Error("base path", r.URL.EscapedPath())
		}
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"success":true,"data":{"id":"a/b"}}`)
	}))
	defer server.Close()
	config := orgConfig(server.URL + "/proxy%20base/")
	client, err := NewMessagingClient(config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = client.Media().Retrieve(context.Background(), "a/b"); err != nil {
		t.Fatal(err)
	}
	calls := &CallsClient{messaging: client}
	if got := calls.socketURL("/messaging/calls/events"); got != "ws"+strings.TrimPrefix(server.URL, "http")+"/proxy%20base/messaging/calls/events" {
		t.Fatal(got)
	}
}
func TestSignedMediaURLFormattingIsRedacted(t *testing.T) {
	value := MediaDownloadURL{URL: "https://storage.invalid/file?signature=synthetic-secret"}
	for _, format := range []string{"%v", "%+v", "%#v"} {
		if text := fmt.Sprintf(format, value); strings.Contains(text, "signature") || strings.Contains(text, "synthetic-secret") || !strings.Contains(text, "redacted") {
			t.Fatal(text)
		}
	}
}

func reviewPointer[T any](value T) *T { return &value }
