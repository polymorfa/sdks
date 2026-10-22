package polymorfa

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestSimultaneousCallsServerDecisions(t *testing.T) {
	for _, v := range []struct {
		status      int
		code, field string
	}{{400, "invalid_parameter", "acknowledgeRisk"}, {403, "permission_denied", ""}, {409, "state_conflict", "expectedRevision"}} {
		t.Run(v.code, func(t *testing.T) {
			attempts := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				attempts++
				var body map[string]any
				if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
					t.Error(err)
				}
				if r.Method != "PUT" || r.URL.Path != "/platform/sessions/s/call-settings" || body["simultaneousCalls"] != true {
					t.Error(r.URL, body)
				}
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(v.status)
				_ = json.NewEncoder(w).Encode(map[string]any{"error": map[string]any{"code": v.code, "message": "Server decision", "param": v.field}})
			}))
			defer s.Close()
			_, err := mustMessaging(t, s.URL).VoIP().UpdateCallSettings(context.Background(), "s", UpdateCallSettingsRequest{SimultaneousCalls: callsBool(true)})
			var api *Error
			if !errors.As(err, &api) || api.Status != v.status || api.Code != v.code || api.Field != v.field || attempts != 1 {
				t.Fatal(err, attempts)
			}
		})
	}
	c := mustMessaging(t, "http://127.0.0.1:1")
	if _, err := c.VoIP().UpdateCallSettings(context.Background(), "s", UpdateCallSettingsRequest{AcknowledgeRisk: callsBool(true)}); err == nil {
		t.Fatal("acknowledgment alone is not a setting")
	}
	var claim BanSafeClaim
	if err := json.Unmarshal([]byte(`{"verdict":"simultaneous_calls","evidence":{"simultaneousCalls":true}}`), &claim); err != nil || claim.Verdict != "simultaneous_calls" || !claim.Evidence.SimultaneousCalls {
		t.Fatal(claim, err)
	}
}
