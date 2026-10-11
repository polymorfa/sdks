package main

import (
	"crypto/sha256"
	"encoding/json"
	polymorfa "github.com/polymorfa/sdks/packages/go"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"net/url"
	"strings"
	"sync/atomic"
	"testing"
)

func TestNativeFrameworkAuthenticatedTokenBoundary(t *testing.T) {
	for _, framework := range []string{"nethttp", "gin"} {
		t.Run(framework, func(t *testing.T) {
			var minted atomic.Int32
			upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				if r.Method != "POST" || r.URL.Path != "/platform/client-tokens" {
					t.Errorf("upstream route %s %s", r.Method, r.URL.Path)
				}
				if r.Header.Get("Authorization") != "Bearer pmfa_"+strings.Repeat("a", 72) || r.Header.Get("Polymorfa-Version") != "2026-09-22" {
					t.Error("upstream auth/version")
				}
				var body map[string]any
				_ = json.NewDecoder(r.Body).Decode(&body)
				if len(body) != 3 || body["ephemeralId"] != "example:app-user" || body["session"] != "authorized-support" || body["ttlSeconds"] != float64(600) {
					t.Error("server assignment", body)
				}
				minted.Add(1)
				w.Header().Set("Content-Type", "application/json")
				w.Write([]byte(`{"success":true,"data":{"token":"pmfa_ct_browser_fixture","expiresAt":"2030-01-01T00:00:00Z"}}`))
			}))
			defer upstream.Close()
			sdk, err := polymorfa.NewMessagingClient(polymorfa.Config{Credential: polymorfa.Credential{Kind: polymorfa.OrganizationAPIKey, Value: "pmfa_" + strings.Repeat("a", 72)}, BaseURL: upstream.URL})
			if err != nil {
				t.Fatal(err)
			}
			a := &app{client: sdk, username: sha256.Sum256([]byte("user")), password: sha256.Sum256([]byte("test-password")), userID: "app-user", session: "authorized-support", sessions: map[string]appSession{}}
			handler := a.routes()
			if framework == "gin" {
				handler = ginHandler(handler)
			}
			server := httptest.NewServer(handler)
			defer server.Close()
			a.origin = server.URL
			jar, _ := cookiejar.New(nil)
			client := &http.Client{Jar: jar, CheckRedirect: func(_ *http.Request, _ []*http.Request) error { return http.ErrUseLastResponse }}
			send := func(method, path, origin, body string) *http.Response {
				r, _ := http.NewRequest(method, server.URL+path, strings.NewReader(body))
				r.Header.Set("Origin", origin)
				r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
				r.Header.Set("HX-Request", "true")
				response, err := client.Do(r)
				if err != nil {
					t.Fatal(err)
				}
				return response
			}
			response := send("POST", "/api/polymorfa/token", server.URL, "")
			if response.StatusCode != 401 {
				t.Fatal(response.Status)
			}
			response.Body.Close()
			response = send("GET", "/api/login", server.URL, "")
			if response.StatusCode != 405 {
				t.Fatal("GET login", response.Status)
			}
			response.Body.Close()
			response = send("POST", "/api/login", "https://foreign.invalid", "username=user&password=test-password")
			if response.StatusCode != 403 {
				t.Fatal(response.Status)
			}
			response.Body.Close()
			response = send("POST", "/api/login", server.URL, "username=user&password=wrong")
			if response.StatusCode != 401 {
				t.Fatal(response.Status)
			}
			response.Body.Close()
			response = send("POST", "/api/login", server.URL, url.Values{"username": {"user"}, "password": {"test-password"}}.Encode())
			html, _ := io.ReadAll(response.Body)
			response.Body.Close()
			if response.StatusCode != 200 || !strings.Contains(string(html), "pmfa-inbox") {
				t.Fatal("templ login", response.Status, string(html))
			}
			cookies := response.Cookies()
			if len(cookies) != 1 || !cookies[0].HttpOnly || cookies[0].SameSite != http.SameSiteStrictMode || strings.Contains(cookies[0].Value, "app-user") {
				t.Fatal("opaque application session")
			}
			response = send("POST", "/api/polymorfa/token", server.URL, "session=attacker&ephemeralId=attacker")
			var token map[string]any
			_ = json.NewDecoder(response.Body).Decode(&token)
			response.Body.Close()
			if response.StatusCode != 200 || token["audience"] != "browser" || token["value"] != "pmfa_ct_browser_fixture" || response.Header.Get("Cache-Control") != "no-store" || minted.Load() != 1 {
				t.Fatal("token result", token, response.Status)
			}
			response = send("POST", "/api/polymorfa/token", "https://foreign.invalid", "")
			if response.StatusCode != 403 || minted.Load() != 1 {
				t.Fatal("origin bypass")
			}
			response.Body.Close()
			response = send("POST", "/api/logout", server.URL, "")
			response.Body.Close()
			response = send("POST", "/api/polymorfa/token", server.URL, "")
			if response.StatusCode != 401 || minted.Load() != 1 {
				t.Fatal("logout failed")
			}
			response.Body.Close()
		})
	}
}
