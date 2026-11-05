package polymorfa

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

type customUploadTransport struct {
	name   string
	upload func(context.Context, string, *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error)
}

func (t customUploadTransport) Name() string { return t.name }
func (t customUploadTransport) Upload(ctx context.Context, s string, b *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error) {
	return t.upload(ctx, s, b)
}
func TestCustomEncryptedUploadTransportNativeWireAndOffset(t *testing.T) {
	plain := bytes.Repeat([]byte("custom encrypted wire\x00"), 4000)
	options := EncryptMediaOptions{MediaType: UploadDocument, MediaKey: bytes.Repeat([]byte{71}, 32)}
	expected, err := EncryptWhatsAppMedia(context.Background(), plain, options)
	if err != nil {
		t.Fatal(err)
	}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Authorization") != "" || r.Header.Get("Polymorfa-Version") != "" {
			t.Error("SDK API credentials reached custom transport")
		}
		raw, err := io.ReadAll(r.Body)
		if err != nil || !bytes.Equal(raw, expected.Ciphertext) {
			t.Error("custom transport did not receive exact encrypted wire")
		}
		io.WriteString(w, `{"direct_path":"/custom/path","url":"https://cdn.whatsapp.net/custom/path"}`)
	}))
	defer server.Close()
	var calls atomic.Int32
	sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) { calls.Add(1); w.WriteHeader(500) })
	var retained *WhatsAppEncryptedUploadBody
	extension := customUploadTransport{"customer-wire", func(ctx context.Context, session string, body *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error) {
		retained = body
		if session != "session" || body.MediaType() != UploadDocument || body.EncryptedLength() != int64(len(expected.Ciphertext)) || !bytes.Equal(body.FileEncSHA256(), expected.FileEncSHA256) {
			t.Fatal("custom body metadata")
		}
		copyHash := body.FileEncSHA256()
		copyHash[0] ^= 1
		if !bytes.Equal(body.FileEncSHA256(), expected.FileEncSHA256) {
			t.Fatal("custom hash accessor exposed mutable storage")
		}
		encoded, _ := json.Marshal(body)
		if strings.Contains(fmt.Sprintf("%#v", body), "mediaKey") || bytes.Contains(encoded, []byte("mediaKey")) || bytes.Contains(encoded, plain[:30]) {
			t.Fatal("custom body exposed plaintext/key")
		}
		partial, err := body.Open(ctx, 13)
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		suffix, err := io.ReadAll(partial)
		partial.Close()
		if err != nil || !bytes.Equal(suffix, expected.Ciphertext[13:]) {
			t.Fatal("encrypted offset stream", err)
		}
		stream, err := body.Open(ctx, 0)
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		defer stream.Close()
		request, _ := http.NewRequestWithContext(ctx, "POST", server.URL, stream)
		request.ContentLength = body.EncryptedLength()
		response, err := server.Client().Do(request)
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		defer response.Body.Close()
		raw, err := io.ReadAll(response.Body)
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		return directLocation(raw)
	}}
	result, err := sdk.WhatsAppMedia().UploadBytes(context.Background(), "session", plain, UploadWhatsAppMediaOptions{EncryptMediaOptions: options, UploadTransport: extension})
	if err != nil || result.Egress != "customer-wire" || result.DirectPath != "/custom/path" || calls.Load() != 0 {
		t.Fatal("custom encrypted transport result", err)
	}
	if _, err = retained.Open(context.Background(), 0); err == nil {
		t.Fatal("custom body reopened after upload completed")
	}
}
func TestCustomEncryptedUploadRefusesIncompleteChangedAndFailedBodies(t *testing.T) {
	for _, mode := range []string{"incomplete", "changed", "error", "cancel", "cancel-ignore", "invalid-offset"} {
		t.Run(mode, func(t *testing.T) {
			plain := bytes.Repeat([]byte{41}, 100003)
			var opens atomic.Int32
			var emitted int
			ctx, cancel := context.WithCancel(context.Background())
			defer cancel()
			sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
				t.Error("custom transport unexpectedly called API")
				w.WriteHeader(500)
			})
			extension := customUploadTransport{"customer-test", func(active context.Context, s string, body *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error) {
				if mode == "error" {
					return WhatsAppUploadLocation{}, fmt.Errorf("transport URL https://private.invalid/?token=secret")
				}
				if mode == "invalid-offset" {
					if _, err := body.Open(active, -1); err == nil {
						t.Fatal("negative offset")
					}
					if _, err := body.Open(active, body.EncryptedLength()+1); err == nil {
						t.Fatal("overflow offset")
					}
					return WhatsAppUploadLocation{DirectPath: "/x", URL: "https://cdn.whatsapp.net/x"}, nil
				}
				reader, err := body.Open(active, 0)
				if err != nil {
					return WhatsAppUploadLocation{}, err
				}
				defer reader.Close()
				if mode == "incomplete" {
					one := make([]byte, 1)
					reader.Read(one)
					return WhatsAppUploadLocation{DirectPath: "/x", URL: "https://cdn.whatsapp.net/x"}, nil
				}
				if mode == "cancel" || mode == "cancel-ignore" {
					cancel()
				}
				raw, err := io.ReadAll(reader)
				emitted = len(raw)
				if mode == "changed" && int64(len(raw)) >= body.EncryptedLength() {
					t.Fatal("changed source released complete encrypted body")
				}
				if mode == "cancel-ignore" {
					err = nil
				}
				return WhatsAppUploadLocation{DirectPath: "/x", URL: "https://cdn.whatsapp.net/x"}, err
			}}
			_, err := sdk.WhatsAppMedia().Upload(ctx, "session", func(context.Context) (io.ReadCloser, error) {
				value := bytes.Clone(plain)
				if opens.Add(1) > 1 && mode == "changed" {
					value[0] ^= 1
				}
				return io.NopCloser(bytes.NewReader(value)), nil
			}, UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadImage}, UploadTransport: extension})
			if err == nil || strings.Contains(fmt.Sprintf("%#v", err), "token=secret") {
				t.Fatal("unsafe custom failure", err)
			}
			if mode == "cancel" || mode == "cancel-ignore" {
				var typed *Error
				if !errors.As(err, &typed) || typed.Kind != CancelledError {
					t.Fatal("custom cancellation", err)
				}
			}
			if mode == "changed" && emitted == 0 {
				t.Fatal("changed regression did not exercise streaming")
			}
		})
	}
}
func TestReusableBuiltinUploadTransportWrapsEncryptedBoundary(t *testing.T) {
	for _, mode := range []string{"relay", "direct"} {
		t.Run(mode, func(t *testing.T) {
			var calls, grants atomic.Int32
			sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) {
				if strings.HasSuffix(r.URL.Path, "/upload-grants") {
					grantFixture(t, w, r, UploadImage, &grants)
					return
				}
				io.Copy(io.Discard, r.Body)
				locationFixture(w, strings.HasPrefix(r.URL.Path, "/mms/"))
			})
			builtin, err := sdk.WhatsAppMedia().UploadTransport(mode, UploadWhatsAppMediaOptions{})
			if err != nil {
				t.Fatal(err)
			}
			wrapper := customUploadTransport{"wrapped-" + mode, func(ctx context.Context, s string, b *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error) {
				calls.Add(1)
				return builtin.Upload(ctx, s, b)
			}}
			result, err := sdk.WhatsAppMedia().UploadBytes(context.Background(), "session", []byte("wrapped media"), UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadImage}, UploadTransport: wrapper})
			if err != nil || calls.Load() != 1 || result.Egress != "wrapped-"+mode {
				t.Fatal("reusable builtin transport", err)
			}
		})
	}
}
func TestCustomTransportCancellationClosesBlockedSource(t *testing.T) {
	sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) { t.Error("unexpected API"); w.WriteHeader(500) })
	var opens atomic.Int32
	var blocked *io.PipeWriter
	ready := make(chan struct{})
	ctx, cancel := context.WithTimeout(context.Background(), 100*time.Millisecond)
	defer cancel()
	extension := customUploadTransport{"blocked-source", func(active context.Context, s string, b *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error) {
		r, err := b.Open(active, 0)
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		defer r.Close()
		close(ready)
		_, err = io.Copy(io.Discard, r)
		return WhatsAppUploadLocation{}, err
	}}
	done := make(chan error, 1)
	go func() {
		_, err := sdk.WhatsAppMedia().Upload(ctx, "session", func(context.Context) (io.ReadCloser, error) {
			if opens.Add(1) == 1 {
				return io.NopCloser(strings.NewReader("initial pass")), nil
			}
			r, w := io.Pipe()
			blocked = w
			return r, nil
		}, UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadImage}, UploadTransport: extension})
		done <- err
	}()
	<-ready
	select {
	case err := <-done:
		var typed *Error
		if !errors.As(err, &typed) || typed.Kind != TimeoutError {
			t.Fatal("blocked custom source timeout", err)
		}
	case <-time.After(time.Second):
		t.Fatal("blocked custom source ignored cancellation")
	}
	if _, err := blocked.Write([]byte("after close")); err == nil {
		t.Fatal("blocked plaintext source was not closed")
	}
	blocked.Close()
}

func TestCustomTransportCannotIgnoreLaterSourceIntegrityFailure(t *testing.T) {
	var opens atomic.Int32
	plain := bytes.Repeat([]byte{17}, 70003)
	sdk := uploadFixture(t, func(w http.ResponseWriter, r *http.Request) { t.Error("unexpected API"); w.WriteHeader(500) })
	extension := customUploadTransport{"ignore-later-error", func(ctx context.Context, s string, b *WhatsAppEncryptedUploadBody) (WhatsAppUploadLocation, error) {
		first, err := b.Open(ctx, 0)
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		_, err = io.Copy(io.Discard, first)
		first.Close()
		if err != nil {
			t.Fatal("initial verified body", err)
		}
		changed, err := b.Open(ctx, 0)
		if err != nil {
			return WhatsAppUploadLocation{}, err
		}
		defer changed.Close()
		raw, err := io.ReadAll(changed)
		if err == nil || int64(len(raw)) >= b.EncryptedLength() {
			t.Fatal("late changed source was finalized")
		}
		return WhatsAppUploadLocation{DirectPath: "/x", URL: "https://cdn.whatsapp.net/x"}, nil
	}}
	_, err := sdk.WhatsAppMedia().Upload(context.Background(), "session", func(context.Context) (io.ReadCloser, error) {
		raw := bytes.Clone(plain)
		if opens.Add(1) >= 3 {
			raw[0] ^= 1
		}
		return io.NopCloser(bytes.NewReader(raw)), nil
	}, UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadImage}, UploadTransport: extension})
	if err == nil {
		t.Fatal("a later integrity failure was hidden by an earlier verified opening")
	}
}
