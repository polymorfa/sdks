package main

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"net/http"
	"net/http/cookiejar"
	"net/http/httptest"
	"strings"
	"sync/atomic"
	"testing"
	"time"

	polymorfa "github.com/polymorfa/sdks/packages/go"
)

func TestSignedIncomingReplySurvivesReloadAndRejectsOtherTargets(t *testing.T) {
	a := &app{peer: "+15550001111", session: "assigned", webhookSecret: "private-local-test-secret", sessions: map[string]appSession{"signed-in": {expires: time.Now().Add(time.Minute), userID: "user"}}}
	a.conversation.peerID = "assigned-conversation"
	server := httptest.NewServer(a.routes())
	defer server.Close()
	post := func(body, signature string) int {
		r, _ := http.NewRequest("POST", server.URL+"/webhooks/polymorfa", strings.NewReader(body))
		r.Header.Set("X-Webhook-Signature", signature)
		response, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		defer response.Body.Close()
		return response.StatusCode
	}
	sign := func(body string) string {
		m := hmac.New(sha256.New, []byte(a.webhookSecret))
		m.Write([]byte(body))
		return "sha256=" + hex.EncodeToString(m.Sum(nil))
	}
	body := `{"id":"event-1","session":"assigned","timestamp":"2026-10-18T06:00:00Z","event":"message.received","payload":{"id":"incoming-1","conversation":{"id":"assigned-conversation"},"fromMe":false,"timestamp":1792303200,"type":"text","text":"Independent peer reply"}}`
	if post(body, "sha256=wrong") != 400 {
		t.Fatal("unsigned message accepted")
	}
	for _, foreign := range []string{strings.Replace(body, `"session":"assigned"`, `"session":"foreign"`, 1), strings.Replace(body, "assigned-conversation", "foreign-conversation", 1)} {
		if post(foreign, sign(foreign)) != 204 {
			t.Fatal("foreign envelope handling")
		}
	}
	for range 2 {
		if post(body, sign(body)) != 204 {
			t.Fatal("signed event rejected")
		}
	}
	for range 2 {
		r, _ := http.NewRequest("GET", server.URL+"/api/polymorfa/conversation", nil)
		r.AddCookie(&http.Cookie{Name: "polymorfa_example_session", Value: "signed-in"})
		response, err := http.DefaultClient.Do(r)
		if err != nil {
			t.Fatal(err)
		}
		var snapshot struct {
			Messages       []conversationMessage
			ReceivedEvents int
		}
		_ = json.NewDecoder(response.Body).Decode(&snapshot)
		response.Body.Close()
		if response.StatusCode != 200 || len(snapshot.Messages) != 1 || snapshot.Messages[0].Text != "Independent peer reply" || snapshot.ReceivedEvents != 1 {
			t.Fatalf("reload/dedup/assignment: %+v", snapshot)
		}
	}
	response, err := http.Get(server.URL + "/api/polymorfa/conversation")
	if err != nil {
		t.Fatal(err)
	}
	response.Body.Close()
	if response.StatusCode != 401 {
		t.Fatal("history exposed without app authentication")
	}
}

func TestNativeSendKeepsCallerKeyAndServerAssignment(t *testing.T) {
	var sends atomic.Int32
	upstream := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/messaging/assigned/messages/send" || r.Header.Get("Idempotency-Key") != "fbb8bb0d-6943-4101-b893-17bd0aa61199" {
			t.Error("native send route or caller key changed")
		}
		var body struct {
			Conversation struct {
				Phone string `json:"phoneNumber"`
			}
			Content struct{ Text string }
		}
		_ = json.NewDecoder(r.Body).Decode(&body)
		if body.Conversation.Phone != "+15550001111" || body.Content.Text != "Hello from Go" {
			t.Error("server assignment or text changed")
		}
		sends.Add(1)
		w.Header().Set("Content-Type", "application/json")
		io.WriteString(w, `{"success":true,"data":{"id":"receipt-1","whatsapp_ids":{"linked_devices":"wa-1"},"timestamp":"2026-10-18T06:00:00Z","status":"sent","type":"text"}}`)
	}))
	defer upstream.Close()
	sdk, err := polymorfa.NewMessagingClient(polymorfa.Config{Credential: polymorfa.Credential{Kind: polymorfa.OrganizationAPIKey, Value: "pmfa_" + strings.Repeat("a", 72)}, BaseURL: upstream.URL})
	if err != nil {
		t.Fatal(err)
	}
	a := &app{client: sdk, username: sha256.Sum256([]byte("user")), password: sha256.Sum256([]byte("password")), session: "assigned", userID: "user", sessions: map[string]appSession{}}
	server := httptest.NewServer(a.routes())
	defer server.Close()
	a.origin = server.URL
	jar, _ := cookiejar.New(nil)
	client := &http.Client{Jar: jar, CheckRedirect: func(*http.Request, []*http.Request) error { return http.ErrUseLastResponse }}
	call := func(path, origin, body string) *http.Response {
		r, _ := http.NewRequest("POST", server.URL+path, strings.NewReader(body))
		r.Header.Set("Origin", origin)
		r.Header.Set("Content-Type", "application/json")
		r.Header.Set("Idempotency-Key", "fbb8bb0d-6943-4101-b893-17bd0aa61199")
		if path == "/api/login" {
			r.Header.Set("Content-Type", "application/x-www-form-urlencoded")
		}
		response, e := client.Do(r)
		if e != nil {
			t.Fatal(e)
		}
		return response
	}
	r := call("/api/polymorfa/send", server.URL, `{"text":"Hello from Go"}`)
	r.Body.Close()
	if r.StatusCode != 401 {
		t.Fatalf("unauthenticated send: %s", r.Status)
	}
	r = call("/api/login", server.URL, "username=user&password=password")
	r.Body.Close()
	// Configure the peer only on the server, after the unauthenticated check.
	a.peer = "+15550001111"
	r = call("/api/polymorfa/send", "https://foreign.invalid", `{"text":"Hello from Go"}`)
	r.Body.Close()
	if r.StatusCode != 403 {
		t.Fatal("foreign origin send accepted")
	}
	r = call("/api/polymorfa/send", server.URL, `{"text":"Hello from Go","session":"foreign"}`)
	r.Body.Close()
	if r.StatusCode != 400 {
		t.Fatal("browser target override accepted")
	}
	for range 2 {
		r = call("/api/polymorfa/send", server.URL, `{"text":"Hello from Go"}`)
		var result map[string]any
		_ = json.NewDecoder(r.Body).Decode(&result)
		r.Body.Close()
		if r.StatusCode != 200 || result["id"] != "receipt-1" {
			t.Fatalf("send: %s %v", r.Status, result)
		}
	}
	if sends.Load() != 1 {
		t.Fatal("same caller key sent twice")
	}
	r = call("/api/polymorfa/send", server.URL, `{"text":"Different text"}`)
	r.Body.Close()
	if r.StatusCode != 409 || sends.Load() != 1 {
		t.Fatal("caller key reused for different content")
	}
}
