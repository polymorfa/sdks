package polymorfa

import (
	"bytes"
	"context"
	"crypto/sha256"
	"encoding/base64"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
	"time"
)

func uploadFixture(t *testing.T, handler http.HandlerFunc) *MessagingClient {
	t.Helper()
	server := httptest.NewTLSServer(http.HandlerFunc(func(w http.ResponseWriter, req *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		handler(w, req)
	}))
	t.Cleanup(server.Close)
	network := server.Client().Transport.(*http.Transport).Clone()
	network.TLSClientConfig.ServerName = "example.com"
	network.DialContext = func(ctx context.Context, _, _ string) (net.Conn, error) {
		return (&net.Dialer{}).DialContext(ctx, "tcp", server.Listener.Addr().String())
	}
	client := server.Client()
	client.Transport = network
	jar, _ := cookiejar.New(nil)
	u, _ := url.Parse("https://cdn.whatsapp.net")
	jar.SetCookies(u, []*http.Cookie{{Name: "must_not_replay", Value: "private_fixture"}})
	client.Jar = jar
	config := orgConfig(server.URL)
	config.HTTPClient = client
	sdk, err := NewMessagingClient(config)
	if err != nil {
		t.Fatal(err)
	}
	return sdk
}
func grantFixture(t *testing.T, w http.ResponseWriter, req *http.Request, kind UploadMediaType, grants *atomic.Int32) {
	t.Helper()
	if req.Header.Get("Authorization") == "" || req.Header.Get("Polymorfa-Version") != CustomerOwnedAPIVersion {
		t.Error("API auth/version missing")
	}
	var body map[string]any
	if json.NewDecoder(req.Body).Decode(&body) != nil {
		t.Error("invalid grant JSON")
	}
	mapped, ptt, _ := uploadKind(kind)
	expectedFields := 2
	if ptt != nil {
		expectedFields = 3
	}
	if body["type"] != mapped || len(body) != expectedFields {
		t.Error("grant shape contains unsupported fields")
	}
	if ptt != nil && body["ptt"] != *ptt {
		t.Error("ptt mapping")
	}
	secret := fmt.Sprintf("synthetic_grant_%d", grants.Add(1))
	json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"host": "cdn.whatsapp.net", "uploadUrl": "https://cdn.whatsapp.net/mms/" + string(kind) + "/" + body["fileEncSha256"].(string) + "?auth=" + secret + "&token=exact-token&media_id=exact-id&server_thumb_gen=1", "expiresAt": 2000000000}})
}
func locationFixture(w http.ResponseWriter, direct bool) {
	if direct {
		io.WriteString(w, `{"direct_path":"/fixture/path","url":"https://cdn.whatsapp.net/fixture/path","handle":"fixture-handle"}`)
	} else {
		io.WriteString(w, `{"success":true,"data":{"directPath":"/fixture/path","url":"https://cdn.whatsapp.net/fixture/path"}}`)
	}
}
func assertCDNHeaders(t *testing.T, req *http.Request) {
	t.Helper()
	if req.Header.Get("Authorization") != "" || req.Header.Get("Cookie") != "" || req.Header.Get("X-Caller-Private") != "" || req.Header.Get("Polymorfa-Version") != "" {
		t.Error("API credential/cookie/caller headers replayed to CDN")
	}
	if req.Header.Get("Origin") != "https://web.whatsapp.com" || req.Header.Get("Referer") != "https://web.whatsapp.com/" {
		t.Error("CDN origin mismatch")
	}
}
func TestNativeEncryptedRelayAndDirectWire(t *testing.T) {
	for _, mode := range []string{"relay", "direct"} {
		for _, kind := range []UploadMediaType{UploadImage, UploadVideo, UploadAudio, UploadVoiceNote, UploadDocument, UploadSticker} {
			t.Run(mode+string(kind), func(t *testing.T) {
				plain := bytes.Repeat([]byte{91}, 70003)
				key := bytes.Repeat([]byte{31}, 32)
				var uploaded []byte
				var grants atomic.Int32
				var legacy atomic.Int32
				sdk := uploadFixture(t, func(w http.ResponseWriter, req *http.Request) {
					switch {
					case strings.HasSuffix(req.URL.Path, "/upload-grants"):
						grantFixture(t, w, req, kind, &grants)
					case strings.HasSuffix(req.URL.Path, "/uploads"):
						if mode != "relay" || req.Header.Get("Content-Type") != "application/octet-stream" || req.Header.Get("Polymorfa-Version") != CustomerOwnedAPIVersion || !strings.HasPrefix(req.Header.Get("Authorization"), "Bearer pmfa_") {
							t.Error("relay binary contract")
						}
						uploaded, _ = io.ReadAll(req.Body)
						sum := sha256.Sum256(uploaded)
						mapped, ptt, _ := uploadKind(kind)
						if req.ContentLength != int64(len(uploaded)) || req.URL.Query().Get("type") != mapped || req.URL.Query().Get("fileEncSha256") != base64.RawURLEncoding.EncodeToString(sum[:]) {
							t.Error("relay length/hash/kind")
						}
						if ptt != nil && req.URL.Query().Get("ptt") != fmt.Sprint(*ptt) {
							t.Error("relay ptt")
						}
						locationFixture(w, false)
					case strings.HasPrefix(req.URL.Path, "/mms/"):
						assertCDNHeaders(t, req)
						if req.URL.Query().Get("token") != "exact-token" || req.URL.Query().Get("media_id") != "exact-id" || req.URL.Query().Get("server_thumb_gen") != "1" {
							t.Error("grant query lost")
						}
						uploaded, _ = io.ReadAll(req.Body)
						if req.ContentLength != int64(len(uploaded)) {
							t.Error("direct length")
						}
						locationFixture(w, true)
					default:
						if req.Header.Get("Polymorfa-Version") != APIVersion {
							t.Error("legacy API default changed")
						}
						legacy.Add(1)
						io.WriteString(w, `{}`)
					}
				})
				result, err := sdk.WhatsAppMedia().UploadBytes(context.Background(), "session", plain, UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: kind, MimeType: "fixture/binary", MediaKey: key}, Egress: mode, RequestOptions: RequestOptions{Headers: func() http.Header {
					h := http.Header{"X-Caller-Private": {"never-cdn"}}
					if mode == "relay" {
						h["authorization"] = []string{"must-not-override"}
						h["polymorfa-version"] = []string{"1900-01-01"}
						h["content-type"] = []string{"must-not-override"}
						h["content-length"] = []string{"1"}
					}
					return h
				}()}})
				if err != nil {
					t.Fatal(err)
				}
				keys, _ := DeriveWhatsAppMediaKeys(result.MediaKey, string(kind))
				length := int64(len(plain))
				decoded, err := DecryptWhatsAppMedia(uploaded, keys, WhatsAppMediaDescriptor{MediaKind: string(kind), MediaKey: result.MediaKey, FileSHA256: result.FileSHA256, FileEncSHA256: result.FileEncSHA256, FileLength: &length}, DefaultWhatsAppMediaMaxBytes)
				if err != nil || !bytes.Equal(decoded, plain) || result.Egress != mode {
					t.Fatal("ciphertext wire integrity", err)
				}
				_, _, err = sdk.t.request(context.Background(), "GET", "/legacy", nil, nil, RequestOptions{})
				if err != nil || legacy.Load() != 1 {
					t.Fatal("legacy method", err)
				}
				encoded, _ := json.Marshal(result)
				if bytes.Contains(encoded, []byte("mediaKey")) || bytes.Contains(encoded, []byte("directPath")) || bytes.Contains(encoded, []byte("cdn.whatsapp.net")) {
					t.Fatal("result secret serialization")
				}
			})
		}
	}
}
func TestNativeDirectRefreshResumeAndStatusRules(t *testing.T) {
	for _, status := range []int{401, 408, 500, 507, 413, 415} {
		t.Run(fmt.Sprint(status), func(t *testing.T) {
			plain := bytes.Repeat([]byte{24}, 100)
			key := bytes.Repeat([]byte{17}, 32)
			gold, _ := EncryptWhatsAppMedia(context.Background(), plain, EncryptMediaOptions{MediaType: UploadImage, MediaKey: key})
			var grants, posts, probes atomic.Int32
			sdk := uploadFixture(t, func(w http.ResponseWriter, req *http.Request) {
				if strings.HasSuffix(req.URL.Path, "/upload-grants") {
					grantFixture(t, w, req, UploadImage, &grants)
					return
				}
				assertCDNHeaders(t, req)
				if req.URL.Query().Get("resume") == "1" {
					probes.Add(1)
					io.WriteString(w, `{"resume":"48"}`)
					return
				}
				count := posts.Add(1)
				body, _ := io.ReadAll(req.Body)
				if count == 1 {
					w.WriteHeader(status)
					return
				}
				if req.URL.Query().Get("bytestart") != "48" || req.URL.Query().Get("byteend") != fmt.Sprint(len(gold.Ciphertext)) || !bytes.Equal(body, gold.Ciphertext[48:]) {
					t.Error("resumed range differs")
				}
				locationFixture(w, true)
			})
			_, err := sdk.WhatsAppMedia().UploadBytes(context.Background(), "session", plain, UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadImage, MediaKey: key}, Egress: "direct"})
			retried := status == 401 || status == 408 || status == 500
			if retried {
				if err != nil || posts.Load() != 2 || probes.Load() != 1 {
					t.Fatal("retry/resume", err)
				}
				expected := int32(1)
				if status == 401 {
					expected = 2
				}
				if grants.Load() != expected {
					t.Fatal("grant refresh")
				}
			} else {
				var typed *Error
				if !errors.As(err, &typed) || typed.Status != status || posts.Load() != 1 || probes.Load() != 0 {
					t.Fatal("nonretryable status", err)
				}
			}
		})
	}
}
func TestNativeDocumentPartsAndChangedSourceNeverFinalize(t *testing.T) {
	for _, changed := range []bool{false, true} {
		t.Run(fmt.Sprint(changed), func(t *testing.T) {
			plain := bytes.Repeat([]byte{56}, 257)
			var opens, grants, finals atomic.Int32
			var uploaded []byte
			var next int64
			sdk := uploadFixture(t, func(w http.ResponseWriter, req *http.Request) {
				if strings.HasSuffix(req.URL.Path, "/upload-grants") {
					grantFixture(t, w, req, UploadDocument, &grants)
					return
				}
				assertCDNHeaders(t, req)
				if req.URL.Query().Get("final_hash") != "" {
					finals.Add(1)
					sum := sha256.Sum256(uploaded)
					if req.URL.Query().Get("final_hash") != base64.RawURLEncoding.EncodeToString(sum[:]) {
						t.Error("final hash differs")
					}
					locationFixture(w, true)
					return
				}
				body, _ := io.ReadAll(req.Body)
				start := req.URL.Query().Get("bytestart")
				if start != fmt.Sprint(next) {
					t.Error("part gap")
				}
				next += int64(len(body))
				if req.URL.Query().Get("byteend") != fmt.Sprint(next) || req.URL.Query().Get("stream") != "1" {
					t.Error("part range")
				}
				uploaded = append(uploaded, body...)
				io.WriteString(w, `{}`)
			})
			source := func(context.Context) (io.ReadCloser, error) {
				current := bytes.Clone(plain)
				if opens.Add(1) > 1 && changed {
					current[0] ^= 1
				}
				return io.NopCloser(bytes.NewReader(current)), nil
			}
			_, err := sdk.WhatsAppMedia().Upload(context.Background(), "session", source, UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadDocument}, Egress: "direct", DocumentPartSize: 37})
			if opens.Load() != 2 {
				t.Fatal("document did not reuse one upload pass")
			}
			if changed {
				var typed *Error
				if !errors.As(err, &typed) || typed.Code != "media_source_changed" || finals.Load() != 0 {
					t.Fatal("changed source finalized", err)
				}
			} else if err != nil || finals.Load() != 1 {
				t.Fatal("document finalize", err)
			}
		})
	}
}
func TestNativeDirectBodyDeadlineRedirectAndSourceCancellation(t *testing.T) {
	var grants, hops atomic.Int32
	sdk := uploadFixture(t, func(w http.ResponseWriter, req *http.Request) {
		if strings.HasSuffix(req.URL.Path, "/upload-grants") {
			grantFixture(t, w, req, UploadImage, &grants)
			return
		}
		assertCDNHeaders(t, req)
		io.Copy(io.Discard, req.Body)
		if req.URL.Query().Get("auth") == "synthetic_grant_1" {
			w.Header().Set("Location", "https://cdn.whatsapp.net/escaped")
			w.WriteHeader(302)
			return
		}
		hops.Add(1)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(200)
		w.(http.Flusher).Flush()
		<-req.Context().Done()
	})
	opts := UploadWhatsAppMediaOptions{EncryptMediaOptions: EncryptMediaOptions{MediaType: UploadImage}, Egress: "direct", RequestOptions: RequestOptions{Timeout: 70 * time.Millisecond}}
	_, err := sdk.WhatsAppMedia().UploadBytes(context.Background(), "session", []byte("first"), opts)
	if err == nil || hops.Load() != 0 {
		t.Fatal("redirect followed", err)
	}
	_, err = sdk.WhatsAppMedia().UploadBytes(context.Background(), "session", []byte("second"), opts)
	var typed *Error
	if !errors.As(err, &typed) || typed.Kind != TimeoutError || typed.Cause != nil || strings.Contains(fmt.Sprintf("%#v", err), "synthetic_grant") {
		t.Fatal("stalled response did not expire safely", err)
	}
	active, cancel := context.WithCancel(context.Background())
	reader, writer := io.Pipe()
	defer writer.Close()
	started := make(chan struct{})
	done := make(chan error, 1)
	go func() {
		_, err := sdk.WhatsAppMedia().Upload(active, "session", func(context.Context) (io.ReadCloser, error) { close(started); return reader, nil }, opts)
		done <- err
	}()
	<-started
	cancel()
	select {
	case err := <-done:
		if !errors.As(err, &typed) || typed.Kind != CancelledError {
			t.Fatal("blocked source cancellation", err)
		}
	case <-time.After(time.Second):
		t.Fatal("source cancellation hung")
	}
}
