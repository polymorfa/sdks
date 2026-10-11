package polymorfa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

var binaryWireCases = []struct {
	SDKMethod, Method, Path string
	Call                    func(context.Context, *MessagingClient) ([]byte, Metadata, error)
}{
	{"MessagingClient.Media.Download", "GET", "/messaging/media/media", func(ctx context.Context, m *MessagingClient) ([]byte, Metadata, error) {
		r, err := m.Media().Download(ctx, "media")
		return r.Data, r.Metadata, err
	}},
	{"MessagingClient.Media.DownloadStream", "GET", "/messaging/media/media", func(ctx context.Context, m *MessagingClient) ([]byte, Metadata, error) {
		r, err := m.Media().DownloadStream(ctx, "media")
		if err != nil {
			return nil, Metadata{}, err
		}
		defer r.Body.Close()
		b, err := io.ReadAll(r.Body)
		return b, r.Metadata, err
	}},
	{"MessagingClient.Chats.DownloadMessageMedia", "GET", "/messaging/s/chats/chat/messages/message/media", func(ctx context.Context, m *MessagingClient) ([]byte, Metadata, error) {
		r, err := m.Chats().DownloadMessageMedia(ctx, "s", "chat", "message")
		return r.Data, r.Metadata, err
	}},
	{"MessagingClient.Chats.DownloadMessageMediaStream", "GET", "/messaging/s/chats/chat/messages/message/media", func(ctx context.Context, m *MessagingClient) ([]byte, Metadata, error) {
		r, err := m.Chats().DownloadMessageMediaStream(ctx, "s", "chat", "message")
		if err != nil {
			return nil, Metadata{}, err
		}
		defer r.Body.Close()
		b, err := io.ReadAll(r.Body)
		return b, r.Metadata, err
	}},
}

func TestTypedBinaryWire(t *testing.T) {
	for _, f := range binaryWireCases {
		t.Run(f.SDKMethod, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != f.Method || r.URL.Path != f.Path || r.Header.Get("Authorization") != "Bearer "+orgConfig("").Credential.Value {
					t.Error("request", r.Method, r.URL, r.Header)
				}
				w.Header().Set("Content-Type", "application/octet-stream")
				w.Header().Set("X-Request-Id", "binary_request")
				w.Write([]byte{0, 1, 255, 2})
			}))
			defer s.Close()
			m, _ := NewMessagingClient(orgConfig(s.URL))
			b, md, err := f.Call(context.Background(), m)
			if err != nil || string(b) != string([]byte{0, 1, 255, 2}) || md.RequestID != "binary_request" {
				t.Fatal(b, md, err)
			}
		})
	}
}

var systemWireCases = []struct {
	SDKMethod, Method, Path, Body, Check string
	Call                                 func(context.Context, *SystemClient) (any, error)
}{
	{"SystemClient.Status", "GET", "/messaging/info/status", `{"status":"ok","uptime":"1d","version":"1","env":"testing"}`, "uptime", func(ctx context.Context, c *SystemClient) (any, error) { return wireData(c.Status(ctx)) }},
	{"SystemClient.Version", "GET", "/messaging/info/version", `{"version":"1","buildTime":"today","env":"testing","apiVersion":"v1","minSupportedVersion":"v1"}`, "apiVersion", func(ctx context.Context, c *SystemClient) (any, error) { return wireData(c.Version(ctx)) }},
	{"SystemClient.Health", "GET", "/health", `{"status":"ok","checks":{"db":{"status":"ok"}}}`, "checks.db.status", func(ctx context.Context, c *SystemClient) (any, error) { return wireData(c.Health(ctx)) }},
	{"SystemClient.Ping", "GET", "/ping", `{"status":"ok"}`, "status", func(ctx context.Context, c *SystemClient) (any, error) { return wireData(c.Ping(ctx)) }},
}

func TestTypedSystemWire(t *testing.T) {
	for _, f := range systemWireCases {
		t.Run(f.SDKMethod, func(t *testing.T) {
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != f.Method || r.URL.Path != f.Path || r.Header.Get("Authorization") != "" {
					t.Error("request", r.Method, r.URL, r.Header)
				}
				w.Header().Set("Content-Type", "application/json")
				io.WriteString(w, f.Body)
			}))
			defer s.Close()
			c, _ := NewSystemClient(orgConfig(s.URL))
			v, err := f.Call(context.Background(), c)
			if err != nil {
				t.Fatal(err)
			}
			raw, _ := json.Marshal(v)
			var got, want any
			json.Unmarshal(raw, &got)
			json.Unmarshal([]byte(f.Body), &want)
			if jsonField(got, f.Check) != jsonField(want, f.Check) {
				t.Fatal(string(raw))
			}
		})
	}
}

var bridgeWireCases = []struct{ SDKMethod, Method, Path string }{{"BridgeClient.Resolve", "GET", "/messaging/bridge/route"}}

func TestTypedBridgeWire(t *testing.T) {
	for _, f := range bridgeWireCases {
		t.Run(f.SDKMethod, func(t *testing.T) {
			credential := Credential{ProjectToken, "pmfa_pt_" + strings.Repeat("a", 93) + "A"}
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != f.Method || r.URL.Path != f.Path || r.Header.Get("Authorization") != "Bearer "+credential.Value {
					t.Error("request", r.Method, r.URL, r.Header)
				}
				w.Header().Set("Content-Type", "application/json")
				io.WriteString(w, `{"wsUrl":"wss://bridge.example/ws","region":"eu","kind":"bridge","signal":"ready","tokenKind":"project","expiresAt":123}`)
			}))
			defer s.Close()
			c, err := NewBridgeClient(Config{Credential: credential, BaseURL: s.URL})
			if err != nil {
				t.Fatal(err)
			}
			r, err := c.Resolve(context.Background())
			if err != nil || r.Data.WSURL != "wss://bridge.example/ws" || r.Data.ExpiresAt != 123 {
				t.Fatal(r, err)
			}
		})
	}
}
