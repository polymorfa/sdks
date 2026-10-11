package polymorfa

import (
	"bytes"
	"context"
	"encoding/hex"
	"encoding/json"
	"errors"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"testing"
)

type fragmentedReader struct{ b []byte }

func (r *fragmentedReader) Read(p []byte) (int, error) {
	if len(r.b) == 0 {
		return 0, io.EOF
	}
	n := 3
	if len(r.b) < n {
		n = len(r.b)
	}
	copy(p, r.b[:n])
	r.b = r.b[n:]
	return n, nil
}

type mediaRoundTripper func(*http.Request) (*http.Response, error)

func (f mediaRoundTripper) RoundTrip(r *http.Request) (*http.Response, error) { return f(r) }
func TestWhatsAppIncrementalVerificationAndAtomicFile(t *testing.T) {
	raw, err := os.ReadFile("../../contracts/fixtures/whatsapp-media.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixtures struct {
		Fixtures []struct{ Kind, Descriptor, Encrypted, Plaintext string }
	}
	if json.Unmarshal(raw, &fixtures) != nil {
		t.Fatal("fixture")
	}
	scratch := filepath.Join(os.Getenv("HOME"), ".polymorfa-agent-work", "multi-language-sdks-20261011", "go-media-tests")
	if err = os.MkdirAll(scratch, 0700); err != nil {
		t.Fatal(err)
	}
	for _, f := range fixtures.Fixtures {
		t.Run(f.Kind, func(t *testing.T) {
			d, err := DecodeWhatsAppMedia(f.Descriptor, f.Kind)
			if err != nil {
				t.Fatal(err)
			}
			encrypted, _ := hex.DecodeString(f.Encrypted)
			expected, _ := hex.DecodeString(f.Plaintext)
			keys, _ := DeriveWhatsAppMediaKeys(d.MediaKey, d.MediaKind)
			for _, mode := range []WhatsAppMediaVerifyMode{VerifyBeforeRelease, VerifyStreaming} {
				reader, err := DecryptWhatsAppMediaStream(context.Background(), &fragmentedReader{append([]byte{}, encrypted...)}, keys, d, 1024, mode)
				if err != nil {
					t.Fatal(err)
				}
				body, err := io.ReadAll(reader)
				reader.Close()
				if err != nil || !bytes.Equal(body, expected) {
					t.Fatal("incremental plaintext", mode, body, err)
				}
			}
			bad := append([]byte{}, encrypted...)
			bad[len(bad)-1] ^= 1
			for _, mode := range []WhatsAppMediaVerifyMode{VerifyBeforeRelease, VerifyStreaming} {
				reader, err := DecryptWhatsAppMediaStream(context.Background(), bytes.NewReader(bad), keys, d, 1024, mode)
				if err != nil {
					t.Fatal(err)
				}
				body, err := io.ReadAll(reader)
				reader.Close()
				var e *Error
				if !errors.As(err, &e) || e.Code != "media_enc_hash_mismatch" {
					t.Fatal("corruption not reported", mode, err)
				}
				if mode == VerifyBeforeRelease && len(body) != 0 {
					t.Fatal("unverified bytes released")
				}
			}
			d.URL = "https://mmg.whatsapp.net/media"
			hc := &http.Client{Transport: mediaRoundTripper(func(r *http.Request) (*http.Response, error) {
				if r.Header.Get("Authorization") != "" || r.Header.Get("Cookie") != "" || r.Header.Get("Origin") != "https://web.whatsapp.com" {
					t.Error("CDN credential boundary")
				}
				return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(encrypted)), Request: r}, nil
			})}
			path := filepath.Join(scratch, f.Kind+".media")
			os.Remove(path)
			result, err := DownloadWhatsAppMediaToFile(context.Background(), d, path, WhatsAppMediaDownloadOptions{MaxBytes: 1024, HTTPClient: hc}, false)
			if err != nil || result.Bytes != int64(len(expected)) {
				t.Fatal(result, err)
			}
			actual, _ := os.ReadFile(path)
			if !bytes.Equal(actual, expected) {
				t.Fatal("file plaintext")
			}
			if _, err = DownloadWhatsAppMediaToFile(context.Background(), d, path, WhatsAppMediaDownloadOptions{MaxBytes: 1024, HTTPClient: hc}, false); err == nil {
				t.Fatal("existing file overwritten")
			}
			hc.Transport = mediaRoundTripper(func(r *http.Request) (*http.Response, error) {
				return &http.Response{StatusCode: 200, Header: http.Header{}, Body: io.NopCloser(bytes.NewReader(bad)), Request: r}, nil
			})
			if _, err = DownloadWhatsAppMediaToFile(context.Background(), d, path, WhatsAppMediaDownloadOptions{MaxBytes: 1024, HTTPClient: hc}, true); err == nil {
				t.Fatal("corrupt file installed")
			}
			actual, _ = os.ReadFile(path)
			if !bytes.Equal(actual, expected) {
				t.Fatal("integrity failure replaced existing target")
			}
			os.Remove(path)
		})
	}
	staged, _ := filepath.Glob(filepath.Join(scratch, ".polymorfa-media-*"))
	if len(staged) != 0 {
		t.Fatal("staging files leaked", staged)
	}
}
