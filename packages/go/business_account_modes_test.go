package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestBusinessAccountModesWire(t *testing.T) {
	for _, account := range []WhatsAppAccountType{WhatsAppApp, BusinessApp, MetaCloud, MetaCoexistence} {
		t.Run(string(account), func(t *testing.T) {
			calls := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				calls++
				if r.Method != "PUT" || r.URL.EscapedPath() != "/messaging/demo%20%2Fa/phone/account-mode" {
					t.Errorf("wrong request: %s %s", r.Method, r.URL.EscapedPath())
				}
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Errorf("decode request: %v", err)
					return
				}
				if body["accountType"] != string(account) || len(body) != 1 {
					t.Errorf("body: %#v", body)
				}
				if r.Header.Get("Polymorfa-Version") != APIVersion {
					t.Error("wrong API version")
				}
				var platform any = "android"
				if account == MetaCloud {
					platform = nil
				}
				w.Header().Set("Content-Type", "application/json")
				json.NewEncoder(w).Encode(map[string]any{"session": "demo /a", "accountType": account, "primaryPlatform": platform, "changed": true, "unlinkedDevices": []int{3, 7}})
			}))
			defer s.Close()
			result, err := mustMessaging(t, s.URL).Testing().SetAccountMode(context.Background(), "demo /a", TestingAccountModeRequest{AccountType: account})
			if err != nil {
				t.Errorf("decode request: %v", err)
				return
			}
			if result.Data.AccountType != account || !result.Data.Changed || len(result.Data.UnlinkedDevices) != 2 || calls != 1 {
				t.Fatalf("result: %#v calls=%d", result, calls)
			}
			if (result.Data.PrimaryPlatform == nil) != (account == MetaCloud) {
				t.Fatal("nullable platform changed")
			}
		})
	}
}

func TestBusinessAccountModesRejectBeforeTransport(t *testing.T) {
	calls := 0
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) { calls++; w.WriteHeader(500) }))
	defer s.Close()
	m := mustMessaging(t, s.URL)
	for _, input := range []TestingAccountModeRequest{{}, {AccountType: "personal"}, {AccountType: "business"}, {AccountType: MetaCloud, PrimaryPlatform: TestingIOS}, {AccountType: BusinessApp, PrimaryPlatform: "web"}} {
		if _, err := m.Testing().SetAccountMode(context.Background(), "demo", input); err == nil {
			t.Errorf("accepted %#v", input)
		}
	}
	config := teamConfig(s.URL)
	config.Credential = Credential{ClientToken, "pmfa_ct_eA"}
	client, err := NewMessagingClient(config)
	if err != nil {
		t.Fatal(err)
	}
	if _, err = client.Testing().SetAccountMode(context.Background(), "demo", TestingAccountModeRequest{AccountType: BusinessApp}); err == nil {
		t.Fatal("client token accepted")
	}
	if calls != 0 {
		t.Fatalf("unexpected transport: %d", calls)
	}
}

func TestBusinessAccountModesRequireCompleteResults(t *testing.T) {
	for _, reply := range []string{
		`{"session":"demo","accountType":"business_app","primaryPlatform":"ios","changed":"false","unlinkedDevices":[]}`,
		`{"session":"demo","accountType":"business_app","primaryPlatform":"ios","unlinkedDevices":[]}`,
		`{"session":"demo","accountType":"personal","primaryPlatform":"ios","changed":false,"unlinkedDevices":[]}`,
	} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			w.Write([]byte(reply))
		}))
		_, err := mustMessaging(t, s.URL).Testing().SetAccountMode(context.Background(), "demo", TestingAccountModeRequest{AccountType: BusinessApp})
		s.Close()
		if err == nil {
			t.Fatalf("accepted malformed result %s", reply)
		}
	}
}

func TestBusinessContactEncryptionOmission(t *testing.T) {
	for _, encryption := range []string{"", "end_to_end", "hybrid", "not_end_to_end"} {
		s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
			w.Header().Set("Content-Type", "application/json")
			profile := map[string]any{"id": "contact"}
			if encryption != "" {
				profile["encryption"] = encryption
			}
			json.NewEncoder(w).Encode(map[string]any{"success": true, "data": profile})
		}))
		result, err := mustMessaging(t, s.URL).Contacts().BusinessProfile(context.Background(), "demo", "contact")
		s.Close()
		if err != nil {
			t.Fatal(err)
		}
		if encryption == "" {
			if result.Data.Data.Encryption != nil {
				t.Fatal("invented encryption")
			}
		} else if result.Data.Data.Encryption == nil || string(*result.Data.Data.Encryption) != encryption {
			t.Fatal("encryption lost")
		}
	}
}

func TestBusinessQuickLinkModeAndPlatform(t *testing.T) {
	calls := 0
	server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		calls++
		if r.Method != "POST" || r.URL.Path != "/messaging/quicklinks" {
			t.Errorf("wrong route %s %s", r.Method, r.URL.Path)
		}
		var body map[string]any
		if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
			t.Error(err)
			return
		}
		configuration := body["configuration"].(map[string]any)["testing"].(map[string]any)["configuration"].(map[string]any)
		if configuration["accountType"] != "business_app" || configuration["primaryPlatform"] != "ios" || configuration["replyBehavior"] != "echo" {
			t.Errorf("lost configuration: %#v", configuration)
		}
		w.Header().Set("Content-Type", "application/json")
		w.Write([]byte(`{"success":true,"data":{"id":"ql","url":"https://example.test/ql","session":"demo","expiresAt":null}}`))
	}))
	defer server.Close()
	client := mustMessaging(t, server.URL)
	input := CreateQuickLinkRequest{Configuration: &QuickLinkConfiguration{Testing: &QuickLinkTesting{Configuration: &TestingConfiguration{AccountType: BusinessApp, PrimaryPlatform: TestingIOS, ReplyBehavior: "echo"}}}}
	if _, err := client.QuickLinks().Create(context.Background(), input); err != nil {
		t.Fatal(err)
	}
	input.Configuration.Testing.Configuration.AccountType = MetaCloud
	if _, err := client.QuickLinks().Create(context.Background(), input); err == nil {
		t.Fatal("cloud accepted a primary phone platform")
	}
	input.Configuration.Testing.Configuration.AccountType = "business"
	if _, err := client.QuickLinks().Create(context.Background(), input); err == nil {
		t.Fatal("legacy account type accepted")
	}
	if calls != 1 {
		t.Fatalf("invalid mode reached transport: %d", calls)
	}
}

func TestBusinessAccountModesSurfaceConflict(t *testing.T) {
	s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(409)
		w.Write([]byte(`{"error":{"type":"conflict_error","code":"state_conflict","message":"The request conflicts with the resource state.","param":null,"request_id":"5f0c2a8e-3b1d-4c6f-9e2a-7d4b1c8f6a30"},"data":null}`))
	}))
	defer s.Close()
	_, err := mustMessaging(t, s.URL).Testing().SetAccountMode(context.Background(), "demo", TestingAccountModeRequest{AccountType: BusinessApp})
	var apiErr *Error
	if !errors.As(err, &apiErr) || apiErr.Kind != ConflictError || apiErr.Status != 409 || apiErr.Code != "state_conflict" {
		t.Fatalf("conflict was not typed: %#v", err)
	}
}
