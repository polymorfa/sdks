package polymorfa

import (
	"context"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"path/filepath"
	"testing"
)

func TestNativeMediaFileAndDownloadURLHelpers(t *testing.T) {
	scratch := filepath.Join(os.Getenv("HOME"), ".polymorfa-agent-work", "multi-language-sdks-20261011", "go-media-tests")
	if err := os.MkdirAll(scratch, 0700); err != nil {
		t.Fatal(err)
	}
	path := filepath.Join(scratch, "api-helper.media")
	os.Remove(path)
	defer os.Remove(path)
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != "GET" || r.Header.Get("Authorization") != "Bearer "+orgConfig("").Credential.Value {
			t.Error("authentication")
		}
		if r.URL.Path == "/messaging/media/url" {
			w.Header().Set("Location", "https://storage.example/media?X-Amz-Date=20260101T000000Z&X-Amz-Expires=60")
			w.Header().Set("X-Request-Id", "url_request")
			w.WriteHeader(302)
			return
		}
		if r.URL.Path != "/messaging/media/media" && r.URL.Path != "/messaging/s/chats/chat/messages/message/media" {
			t.Error(r.URL.Path)
		}
		w.Header().Set("Content-Type", "audio/ogg")
		w.Header().Set("Content-Disposition", `attachment; filename="voice.ogg"`)
		w.Header().Set("X-Request-Id", "file_request")
		w.Write([]byte{0, 1, 255, 2})
	}))
	defer s.Close()
	c, _ := NewMessagingClient(orgConfig(s.URL))
	result, err := c.Media().DownloadToFile(context.Background(), "media", path, MediaFileOptions{MaxBytes: 4})
	actual, _ := os.ReadFile(path)
	if err != nil || result.Bytes != 4 || result.Metadata.RequestID != "file_request" || result.ContentType != "audio/ogg" || result.Filename != "voice.ogg" || string(actual) != string([]byte{0, 1, 255, 2}) {
		t.Fatal(result, err, actual)
	}
	count := calls
	no := false
	_, err = c.Media().DownloadToFile(context.Background(), "media", path, MediaFileOptions{Overwrite: &no})
	var e *Error
	if !errors.As(err, &e) || e.Code != "file_exists" || calls != count {
		t.Fatal("existing destination", err, calls)
	}
	_, err = c.Chats().DownloadMessageMediaToFile(context.Background(), "s", "chat", "message", path, MediaFileOptions{MaxBytes: 3})
	actual, _ = os.ReadFile(path)
	if !errors.As(err, &e) || e.Code != "media_too_large" || len(actual) != 4 {
		t.Fatal("oversize replaced destination", err, actual)
	}
	result, err = c.Chats().DownloadMessageMediaToFile(context.Background(), "s", "chat", "message", path, MediaFileOptions{MaxBytes: 4})
	if err != nil || result.Bytes != 4 {
		t.Fatal(result, err)
	}
	url, err := c.Media().DownloadURL(context.Background(), "url")
	if err != nil || url.Streamed || url.RequestID != "url_request" || url.ExpiresAt == nil || url.ExpiresAt.Unix() != 1767225660 {
		t.Fatal(url, err)
	}
	streamed, err := c.Media().DownloadURL(context.Background(), "media")
	if err != nil || !streamed.Streamed || streamed.URL != "" {
		t.Fatal(streamed, err)
	}
}
