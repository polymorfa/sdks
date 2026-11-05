package polymorfa_test

import (
	"context"
	"encoding/json"
	"fmt"
	sdk "github.com/polymorfa/sdks/packages/go"
	"io"
	"net/http"
	"strings"
	"testing"
)

const go41Config = `{"effective":{"historySync":{"mode":"deliver","requestFull":false,"delivery":"archive"},"hms":{"enabled":false}},"overrides":{},"requestedHistory":{"mode":"deliver","requestFull":false,"delivery":"descriptor"},"sources":{"historySync.mode":"consent","historySync.requestFull":"team","historySync.delivery":"platform"},"revisions":{"team":0,"project":0,"session":0}}`

func TestGo41ConfigurationIntentAndReadFacts(t *testing.T) {
	for _, reset := range []string{"", sdk.SessionResetHistoryDelivery, sdk.SessionResetHistorySync} {
		for _, version := range []string{"", sdk.APIVersion, sdk.CustomerOwnedAPIVersion} {
			for _, surface := range []string{"team", "project", "session", "messaging"} {
				t.Run(surface+"/"+reset+"/"+version, func(t *testing.T) {
					calls := 0
					m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
						calls++
						want := version
						if want == "" {
							want = sdk.APIVersion
							if reset != sdk.SessionResetHistorySync {
								want = sdk.CustomerOwnedAPIVersion
							}
						}
						if r.Header.Get("Polymorfa-Version") != want {
							t.Error("delivery version intent")
						}
						var b map[string]any
						json.NewDecoder(r.Body).Decode(&b)
						if b["revision"] != float64(0) {
							t.Error("revision zero lost")
						}
						if surface == "project" && b["projectId"] != go41Project {
							t.Error("project owner")
						}
						w.Header().Set("Content-Type", "application/json")
						if strings.Contains(r.URL.Path, "/sessions/") {
							io.WriteString(w, `{"data":{"signalMode":"zero_knowledge","configuration":`+go41Config+`}}`)
						} else {
							io.WriteString(w, `{"data":`+go41Config+`}`)
						}
					})
					delivery := sdk.HistoryDeliverySetDescriptor
					b := sdk.UpdateSessionRequest{}
					if reset == "" {
						b.Configuration.Set = &sdk.SessionConfigurationOverrides{HistorySync: &sdk.HistorySyncPolicyPatch{Delivery: &delivery}}
					} else {
						b.Configuration.Reset = []string{reset}
					}
					p := sdk.RequestOptions{APIVersion: version}
					var e error
					switch surface {
					case "team":
						_, e = o.SessionConfiguration().Update(context.Background(), b, p)
					case "project":
						project, _ := o.Project(go41Project)
						_, e = project.SessionConfiguration().Update(context.Background(), b, p)
					case "session":
						_, e = o.Sessions().Update(context.Background(), "session /x", b, p)
					default:
						_, e = m.Sessions().Update(context.Background(), "session /x", b, p)
					}
					if e != nil || calls != 1 {
						t.Fatalf("update %v", e)
					}
				})
			}
		}
	}
	m, o := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
		if r.Header.Get("Polymorfa-Version") != sdk.APIVersion {
			t.Error("GET version changed")
		}
		w.Header().Set("Content-Type", "application/json")
		if strings.Contains(r.URL.Path, "/sessions/") {
			io.WriteString(w, `{"data":{"signalMode":"zero_knowledge","configuration":`+go41Config+`}}`)
		} else {
			io.WriteString(w, `{"data":`+go41Config+`}`)
		}
	})
	view, e := o.SessionConfiguration().Retrieve(context.Background())
	if e != nil || *view.Data.Effective.HistorySync.Delivery != sdk.HistoryDeliveryArchive || *view.Data.RequestedHistory.Delivery != sdk.HistoryDeliveryDescriptor || *view.Data.Sources.HistorySyncDelivery != sdk.ConfigurationPlatform {
		t.Fatalf("read/write split %v", e)
	}
	session, e := m.Sessions().Retrieve(context.Background(), "s")
	if e != nil || *session.Data.Data.SignalMode != sdk.SignalCustodyZeroKnowledge {
		t.Fatal(e)
	}
}
func TestGo41QuickLinkIntentAndPreDecodeGuards(t *testing.T) {
	for _, version := range []string{"", sdk.APIVersion, sdk.CustomerOwnedAPIVersion} {
		for _, intent := range []string{"legacy", "standard", "zero_knowledge", "delivery"} {
			t.Run(intent+"/"+version, func(t *testing.T) {
				m, _ := go41Client(t, func(w http.ResponseWriter, r *http.Request) {
					var b map[string]any
					json.NewDecoder(r.Body).Decode(&b)
					want := version
					if want == "" {
						want = sdk.APIVersion
						if intent != "legacy" {
							want = sdk.CustomerOwnedAPIVersion
						}
					}
					if r.Header.Get("Polymorfa-Version") != want {
						t.Error("QuickLink version")
					}
					if intent == "delivery" {
						h := b["configuration"].(map[string]any)["historySync"].(map[string]any)
						if h["delivery"] != "descriptor" || h["consent"] != "force_off" {
							t.Error("intent/consent lost")
						}
					}
					w.Header().Set("Content-Type", "application/json")
					io.WriteString(w, `{"success":true,"data":{"id":"invite","purpose":"initial","url":"https://example.com/invite","session":"s","expiresAt":null}}`)
				})
				b := sdk.CreateQuickLinkRequest{ProjectID: go41Project}
				if intent == "standard" || intent == "zero_knowledge" {
					v := sdk.SignalCustodyMode(intent)
					b.SignalMode = &v
				}
				if intent == "delivery" {
					d := sdk.HistoryDeliverySetDescriptor
					b.Configuration = &sdk.QuickLinkConfiguration{HistorySync: &sdk.QuickLinkHistorySync{Delivery: &d, Consent: "force_off"}}
				}
				if _, e := m.QuickLinks().Create(context.Background(), b, sdk.RequestOptions{APIVersion: version}); e != nil {
					t.Fatal(e)
				}
			})
		}
	}
	for _, bad := range []string{`{"configuration":{"signalMode":"zero_knowledge"}}`, `{"configuration":{"zeroKnowledge":true}}`, `{"configuration":{"signal_mode":"zero_knowledge"}}`, `{"configuration":{"signalModeDefault":"standard"}}`, `{"configuration":{"signalRelay":{}}}`, `{"configuration":{"historySync":{"delivery":"archive"}}}`, `{"configuration":{"historySync":{"delivery":null}}}`, `{"signalMode":null}`, `{"purpose":"add_connection","session":"s","addConnection":"linked_devices","signalMode":"standard"}`, `{"purpose":"initial","session":"s"}`, `{"purpose":"add_connection","session":"s"}`, `{"purpose":"add_connection","session":"s","addConnection":"linked_devices","customerId":"x"}`} {
		var v sdk.CreateQuickLinkRequest
		if e := json.Unmarshal([]byte(bad), &v); e == nil {
			t.Fatalf("lost invalid request data %s", bad)
		}
	}
	calls := 0
	m, _ := go41Client(t, func(w http.ResponseWriter, r *http.Request) { calls++ })
	d := sdk.HistorySyncDeliveryPatch("archive")
	_, e := m.QuickLinks().Create(context.Background(), sdk.CreateQuickLinkRequest{Configuration: &sdk.QuickLinkConfiguration{HistorySync: &sdk.QuickLinkHistorySync{Delivery: &d}}})
	if e == nil || calls != 0 {
		t.Fatal("archive request reached I/O")
	}
	for _, bad := range []string{`{"revision":0,"configuration":{"set":{"signalMode":"zero_knowledge"}}}`, `{"revision":0,"configuration":{"reset":["signalMode"]}}`, `{"revision":0,"configuration":{"set":{"historySync":{"delivery":null}}}}`} {
		var v sdk.UpdateSessionRequest
		if json.Unmarshal([]byte(bad), &v) == nil {
			t.Fatal("invalid configuration decoded")
		}
	}
}
func TestGo41ProjectedHistoryDiscriminators(t *testing.T) {
	common := `"delivery":"descriptor","whatsapp_ids":{"linked_devices":"chunk-19"},"original_whatsapp_ids":{"linked_devices":"original-19"},"syncType":"FUTURE_SYNC","chunkOrder":4294967296,"progress":0,"fileLength":0,"oldestMessageAt":"2026-10-16T00:00:00Z"`
	media := `"media":{"type":"md-msg-hist","directPath":"/blob","mediaKey":"private-key","fileSha256":"hash","fileEncSha256":"enc-hash"}`
	inline := `"inline":{"encoding":"zlib-base64-protobuf","data":"compressed"}`
	for _, branch := range []string{media, inline} {
		event := sdk.WebhookEvent{ID: "event-uuid", Event: "history.sync", Payload: json.RawMessage(`{` + common + `,` + branch + `}`)}
		v, known, e := event.TypedPayload()
		if e != nil || !known {
			t.Fatal(e)
		}
		switch p := v.(type) {
		case *sdk.DirectHistorySyncMediaPayload:
			if p.WhatsAppIDs.LinkedDevices != "chunk-19" || p.OriginalWhatsAppIDs.LinkedDevices != "original-19" || p.Media.Type != "md-msg-hist" || *p.ChunkOrder != 4294967296 {
				t.Fatal("public projection lost")
			}
			encoded, _ := json.Marshal(p)
			if strings.Contains(string(encoded), "private-key") || strings.Contains(fmt.Sprintf("%#v %v", p, p), "private-key") {
				t.Fatal("key-bearing formatting")
			}
		case *sdk.DirectHistorySyncInlinePayload:
			if p.Inline.Encoding != "zlib-base64-protobuf" || p.FileLength != 0 {
				t.Fatal("inline branch")
			}
		default:
			t.Fatalf("wrong projection %T", v)
		}
	}
	for _, b := range []string{`{` + common + `}`, `{` + common + `,` + media + `,` + inline + `}`, `{` + common + `,"media":null}`, `{` + common + `,"inline":{"encoding":"gzip","data":"x"}}`, strings.Replace(`{`+common+`,`+media+`}`, `"type":"md-msg-hist",`, "", 1), strings.Replace(`{`+common+`,`+inline+`}`, `"whatsapp_ids":{"linked_devices":"chunk-19"},`, "", 1)} {
		_, _, e := (sdk.WebhookEvent{Event: "history.sync", Payload: json.RawMessage(b)}).TypedPayload()
		if e == nil {
			t.Fatalf("invalid projection accepted %s", b)
		}
	}
	for _, b := range []string{`{"kind":"history","value":{}}`, `{"whatsapp_ids":{},"messages":[],"mode":"deliver","syncType":"RECENT","fileLength":0,"whatsapp":{"encoding":"json","data":"x"}}`} {
		v, known, e := (sdk.WebhookEvent{Event: "history.sync", Payload: json.RawMessage(b)}).TypedPayload()
		if e != nil || !known {
			t.Fatal(e)
		}
		switch v.(type) {
		case *sdk.CloudHistorySyncPayload, *sdk.LinkedHistorySyncPayload:
		default:
			t.Fatal("legacy branch lost")
		}
	}
}
