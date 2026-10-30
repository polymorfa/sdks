package polymorfa

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"os"
	"testing"
)

func TestCallSettingsCoverageEndResponseOnly(t *testing.T) {
	data, err := os.ReadFile("../../contracts/fixtures/calls-coverage-end.candidate.json")
	if err != nil {
		t.Fatal(err)
	}
	var fixture struct {
		Settings map[string]any
		Cases    []struct {
			Name  string
			On    bool
			Until *string
		}
	}
	if err := json.Unmarshal(data, &fixture); err != nil {
		t.Fatal(err)
	}
	for _, c := range fixture.Cases {
		for _, method := range []string{"GET", "PUT"} {
			t.Run(c.Name+method, func(t *testing.T) {
				server := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
					if r.Method != method || r.URL.Path != "/platform/sessions/support/call-settings" {
						t.Error(r.Method, r.URL)
					}
					if method == "PUT" {
						var body map[string]any
						if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
							t.Error(err)
						}
						if len(body) != 1 || body["callsEnabled"] != false {
							t.Error(body)
						}
					}
					settings := map[string]any{}
					for k, v := range fixture.Settings {
						settings[k] = v
					}
					settings["simultaneousCalls"] = c.On
					settings["simultaneousCallsCoverageExcludedUntil"] = c.Until
					w.Header().Set("Content-Type", "application/json")
					_ = json.NewEncoder(w).Encode(map[string]any{"success": true, "data": settings})
				}))
				defer server.Close()
				client := mustMessaging(t, server.URL)
				var response Response[Envelope[SessionCallSettings]]
				var err error
				if method == "GET" {
					response, err = client.VoIP().RetrieveCallSettings(context.Background(), "support")
				} else {
					response, err = client.VoIP().UpdateCallSettings(context.Background(), "support", UpdateCallSettingsRequest{CallsEnabled: callsBool(false)})
				}
				if err != nil {
					t.Fatal(err)
				}
				actual := response.Data.Data.SimultaneousCallsCoverageExcludedUntil
				if (actual == nil) != (c.Until == nil) || actual != nil && *actual != *c.Until {
					t.Fatal(actual, c.Until)
				}
				if response.Data.Data.SimultaneousCalls != c.On || response.Data.Data.Revision != 2 {
					t.Fatal(response.Data.Data)
				}
			})
		}
	}
	var older SessionCallSettings
	legacy, err := json.Marshal(fixture.Settings)
	if err != nil {
		t.Fatal(err)
	}
	if err := json.Unmarshal(legacy, &older); err != nil || older.SimultaneousCallsCoverageExcludedUntil != nil {
		t.Fatal(older, err)
	}
	encoded, err := json.Marshal(older)
	if err != nil {
		t.Fatal(err)
	}
	var roundtrip map[string]any
	if err := json.Unmarshal(encoded, &roundtrip); err != nil {
		t.Fatal(err)
	}
	if v, ok := roundtrip["simultaneousCallsCoverageExcludedUntil"]; !ok || v != nil {
		t.Fatal(roundtrip)
	}

}
