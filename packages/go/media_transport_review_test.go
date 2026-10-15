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

// Some transports finish a cancelled body with EOF instead of a context error.
// The download's authority is its context, not the transport's final sentinel.
type mediaEOFOnCancellation struct {
	ctx    context.Context
	cancel context.CancelFunc
}

func (body mediaEOFOnCancellation) Read(buffer []byte) (int, error) {
	if body.cancel != nil {
		body.cancel()
	}
	<-body.ctx.Done()
	return copy(buffer, "partial"), io.EOF
}
func (mediaEOFOnCancellation) Close() error { return nil }

func TestMediaEOFCannotHideCancellationOrDeadline(t *testing.T) {
	for _, redirected := range []bool{false, true} {
		for _, stream := range []bool{false, true} {
			for _, mode := range []string{"timeout", "cancel", "complete"} {
				t.Run(fmt.Sprintf("redirected=%v/stream=%v/%s", redirected, stream, mode), func(t *testing.T) {
					ctx, cancel := context.WithCancel(context.Background())
					defer cancel()
					config := orgConfig("https://api.fixture.invalid")
					config.MaxNetworkRetries = reviewPointer(0)
					config.HTTPClient = &http.Client{Transport: mediaRoundTripper(func(req *http.Request) (*http.Response, error) {
						header := http.Header{"Content-Type": []string{"application/octet-stream"}, "X-Request-Id": []string{"eof_download"}}
						if redirected && req.URL.Host == "api.fixture.invalid" {
							header.Set("Location", "https://storage.fixture.invalid/synthetic")
							return &http.Response{StatusCode: 302, Header: header, Body: io.NopCloser(strings.NewReader("")), Request: req}, nil
						}
						if req.URL.Host == "storage.fixture.invalid" && (req.Header.Get("Authorization") != "" || req.Header.Get("Polymorfa-Version") != "") {
							t.Fatal("API credentials crossed the storage boundary")
						}
						var body io.ReadCloser = io.NopCloser(strings.NewReader("complete"))
						if mode != "complete" {
							var interrupt context.CancelFunc
							if mode == "cancel" {
								interrupt = cancel
							}
							body = mediaEOFOnCancellation{ctx: req.Context(), cancel: interrupt}
						}
						return &http.Response{StatusCode: 200, Header: header, Body: body, Request: req}, nil
					})}
					client, err := NewMessagingClient(config)
					if err != nil {
						t.Fatal(err)
					}
					opts := RequestOptions{Timeout: 20 * time.Millisecond}
					var data []byte
					var metadata Metadata
					if stream {
						download, openErr := client.Media().DownloadStream(ctx, "fixture", opts)
						if openErr != nil {
							t.Fatal(openErr)
						}
						defer download.Body.Close()
						metadata = download.Metadata
						data, err = io.ReadAll(download.Body)
					} else {
						response, readErr := client.Media().Download(ctx, "fixture", opts)
						data, metadata, err = response.Data, response.Metadata, readErr
					}
					if mode == "complete" {
						if err != nil || string(data) != "complete" {
							t.Fatalf("normal EOF: %q %v", data, err)
						}
						return
					}
					want, cause := TimeoutError, context.DeadlineExceeded
					if mode == "cancel" {
						want, cause = CancelledError, context.Canceled
					}
					var typed *Error
					if !errors.As(err, &typed) || typed.Kind != want || !errors.Is(err, cause) || typed.Metadata.RequestID != "eof_download" || metadata.RequestID != "eof_download" {
						t.Fatalf("cancelled EOF must retain error and metadata: %T %v, metadata %+v", err, err, metadata)
					}
					if !stream && len(data) != 0 {
						t.Fatal("buffered download returned incomplete data")
					}
				})
			}
		}
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
