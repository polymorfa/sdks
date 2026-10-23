package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"os"
	"strings"
	"sync/atomic"
	"testing"
)

func TestPasskeyFiveWire(t *testing.T) {
	data, err := os.ReadFile("../../contracts/fixtures/passkeys.candidate.json")
	if err != nil {
		t.Fatal(err)
	}
	var f struct {
		Issue           IssuePasskeyChallengeRequest
		Assertion       SubmitPasskeyAssertionRequest
		Confirm         ConfirmPasskeyRequest
		Ticket          PasskeyTicket
		AssertionResult PasskeyAssertionResult
		Statuses        []string
	}
	if err := json.Unmarshal(data, &f); err != nil {
		t.Fatal(err)
	}
	for i := 0; i < 5; i++ {
		method, path := "GET", "/messaging/desk%2F1/passkey/confirmation"
		var body, reply any
		switch i {
		case 0:
			method = "POST"
			path = "/messaging/desk%2F1/passkey/challenge"
			body = f.Issue
			reply = f.Ticket
		case 1:
			path = "/messaging/desk%2F1/passkey/challenge/ticket%2F%3F"
			reply = f.Ticket
		case 2:
			method = "POST"
			path = "/messaging/desk%2F1/passkey/assertion"
			body = f.Assertion
			reply = f.AssertionResult
		case 3:
			reply = PasskeyConfirmation{Status: "code_available", TicketID: &f.Confirm.TicketID, Code: f.Confirm.Code}
		case 4:
			method = "POST"
			body = f.Confirm
			reply = PasskeyConfirmation{Status: "waiting_for_pairing"}
		}
		count := 0
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			count++
			if r.Method != method || r.URL.EscapedPath() != path {
				t.Error(r.Method, r.URL.EscapedPath(), path)
			}
			if r.Header.Get("Authorization") == "" || r.Header.Get("Polymorfa-Version") != "2026-09-22" {
				t.Error(r.Header)
			}
			if body != nil {
				var actual any
				_ = json.NewDecoder(r.Body).Decode(&actual)
				expected, _ := json.Marshal(body)
				got, _ := json.Marshal(actual)
				if string(got) != string(expected) {
					var want any
					_ = json.Unmarshal(expected, &want)
					b, _ := json.Marshal(want)
					if string(got) != string(b) {
						t.Error(string(got), string(b))
					}
				}
			}
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": reply})
		}))
		c := mustMessaging(t, server.URL).Passkeys()
		switch i {
		case 0:
			v, e := c.IssueChallenge(context.Background(), "desk/1", f.Issue)
			if e != nil || v.Data.Data.TimeoutMS == nil || *v.Data.Data.TimeoutMS != 120000 {
				t.Fatal(v, e)
			}
		case 1:
			v, e := c.GetChallenge(context.Background(), "desk/1", "ticket/?")
			if e != nil || v.Data.Data.ExpiresAt != f.Ticket.ExpiresAt {
				t.Fatal(v, e)
			}
		case 2:
			v, e := c.SubmitAssertion(context.Background(), "desk/1", f.Assertion)
			if e != nil || !v.Data.Data.OK {
				t.Fatal(v, e)
			}
		case 3:
			v, e := c.GetConfirmation(context.Background(), "desk/1")
			if e != nil || v.Data.Data.Status != "code_available" {
				t.Fatal(v, e)
			}
		case 4:
			v, e := c.Confirm(context.Background(), "desk/1", f.Confirm)
			if e != nil || v.Data.Data.Status != "waiting_for_pairing" {
				t.Fatal(v, e)
			}
		}
		server.Close()
		if count != 1 {
			t.Fatal(count)
		}
	}
}

func TestPasskeyBoundaries(t *testing.T) {
	data, _ := os.ReadFile("../../contracts/fixtures/passkeys.candidate.json")
	var f struct {
		Issue     IssuePasskeyChallengeRequest
		Assertion SubmitPasskeyAssertionRequest
		Confirm   ConfirmPasskeyRequest
		Statuses  []string
		Errors    []int
	}
	if e := json.Unmarshal(data, &f); e != nil {
		t.Fatal(e)
	}
	ctx := context.Background()
	retries := 3
	o := RequestOptions{MaxNetworkRetries: &retries, IdempotencyKey: "caller"}
	for _, status := range f.Statuses {
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": map[string]any{"status": status, "skipHandoffUX": false}})
		}))
		v, e := mustMessaging(t, server.URL).Passkeys().GetConfirmation(ctx, "s")
		server.Close()
		if e != nil || v.Data.Data.Status != status || v.Data.Data.SkipHandoffUX == nil || *v.Data.Data.SkipHandoffUX || v.Data.Data.Code != nil {
			t.Fatal(v, e)
		}
	}
	for _, status := range f.Errors {
		var count atomic.Int32
		server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			count.Add(1)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(status)
			_, _ = w.Write([]byte(`{"error":{"code":"future_passkey","message":"refused"}}`))
		}))
		_, e := mustMessaging(t, server.URL).Passkeys().Confirm(ctx, "s", f.Confirm, o)
		server.Close()
		var api *Error
		if !errors.As(e, &api) || api.Status != status || api.Code != "future_passkey" || count.Load() != 1 {
			t.Fatal(e, count.Load())
		}
	}
	for _, mode := range []string{"503", "non-json", "network"} {
		for i := 0; i < 3; i++ {
			var count atomic.Int32
			server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				count.Add(1)
				if mode == "network" {
					conn, _, e := w.(http.Hijacker).Hijack()
					if e == nil {
						_ = conn.Close()
					}
					return
				}
				if mode == "503" {
					w.Header().Set("Content-Type", "application/json")
					w.WriteHeader(503)
					_, _ = w.Write([]byte(`{"error":{"code":"future_passkey","message":"refused"}}`))
				} else {
					w.Header().Set("Content-Type", "text/html")
					w.WriteHeader(502)
					_, _ = w.Write([]byte("<html>unavailable</html>"))
				}
			}))
			r := mustMessaging(t, server.URL).Passkeys()
			var e error
			switch i {
			case 0:
				_, e = r.IssueChallenge(ctx, "s", f.Issue, o)
			case 1:
				_, e = r.SubmitAssertion(ctx, "s", f.Assertion, o)
			case 2:
				_, e = r.Confirm(ctx, "s", f.Confirm, o)
			}
			server.Close()
			if e == nil || count.Load() != 1 {
				t.Fatal(mode, i, e, count.Load())
			}
		}
	}
	for _, body := range []any{IssuePasskeyChallengeRequest{}, ConfirmPasskeyRequest{TicketID: "t"}} {
		bytes, _ := json.Marshal(body)
		var fields map[string]any
		_ = json.Unmarshal(bytes, &fields)
		if _, ok := fields["code"]; ok {
			t.Fatal(fields)
		}
		if _, ok := fields["challengeB64Url"]; ok {
			t.Fatal(fields)
		}
	}
	bad := f.Assertion
	bad.Assertion.ID = strings.Repeat("x", 1365)
	if _, e := mustMessaging(t, "http://127.0.0.1:1").Passkeys().SubmitAssertion(ctx, "s", bad); e == nil {
		t.Fatal("oversized credential accepted")
	}
	bad = f.Assertion
	bad.Assertion.Response.SignatureB64 = strings.Repeat("x", 1048576)
	if e := passkeyBudget(bad); e == nil {
		t.Fatal("body budget accepted")
	}
}

func TestPasskeyMaximumWire(t *testing.T) {
	handle := strings.Repeat("x", 86)
	body := SubmitPasskeyAssertionRequest{TicketID: "t", Assertion: PasskeyAssertion{ID: strings.Repeat("x", 1364), RawIDB64URL: strings.Repeat("x", 1364), Response: PasskeyAssertionResponse{AuthenticatorDataB64: "AQID", ClientDataJSONB64: "e30", SignatureB64: "AQID", UserHandleB64: &handle}}}
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		var got SubmitPasskeyAssertionRequest
		if e := json.NewDecoder(r.Body).Decode(&got); e != nil {
			t.Error(e)
		}
		if got.Assertion.ID != body.Assertion.ID || got.Assertion.RawIDB64URL != body.Assertion.RawIDB64URL || got.Assertion.Response.UserHandleB64 == nil || *got.Assertion.Response.UserHandleB64 != handle {
			t.Error("maximum wire fields changed")
		}
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`{"success":true,"data":{"ok":true,"ticket":"t","session":"s"}}`))
	}))
	defer server.Close()
	if _, e := mustMessaging(t, server.URL).Passkeys().SubmitAssertion(context.Background(), "s", body); e != nil {
		t.Fatal(e)
	}
}
