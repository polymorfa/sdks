package polymorfa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"reflect"
	"strings"
	"testing"
)

func wireData[T any](r Response[T], err error) (any, error) { return r.Data, err }

type operationFixture struct {
	SDKMethod string
	Method    string
	Path      string
	Query     string
	Body      string
	Response  string
	Check     string
	Call      func(context.Context, *MessagingClient, *OrganizationClient, *ProjectClient) (any, error)
}

var operationFixtures = []operationFixture{
	{"MessagingClient.Sessions.List", "GET", "/platform/sessions", "", "", `{"data":[{"sessionId":"s","name":"Support"}]}`, "data.0.sessionId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().List(ctx))
	}},
	{"MessagingClient.Sessions.Retrieve", "GET", "/platform/sessions/s", "", "", `{"success":true,"data":{"sessionId":"s","name":"Support"}}`, "data.sessionId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().Retrieve(ctx, "s"))
	}},
	{"MessagingClient.Sessions.Update", "PUT", "/platform/sessions/s", "", `{"configuration":{"reset":["hms"]},"revision":2}`, `{"success":true,"data":{"sessionId":"s","name":"Support"}}`, "data.sessionId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().Update(ctx, "s", UpdateSessionRequest{Configuration: SessionConfigurationPatch{Reset: []string{"hms"}}, Revision: 2}))
	}},
	{"MessagingClient.Sessions.Delete", "DELETE", "/platform/sessions/s", "", "", `{"data":{"removed":true,"sessionId":"s"}}`, "data.removed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().Delete(ctx, "s"))
	}},
	{"MessagingClient.Sessions.Start", "POST", "/platform/sessions/s/start", "", "", `{"data":{"starting":true,"sessionId":"s"}}`, "data.starting", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().Start(ctx, "s"))
	}},
	{"MessagingClient.Sessions.Stop", "POST", "/platform/sessions/s/stop", "", "", `{"data":{"stopping":true,"sessionId":"s"}}`, "data.stopping", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().Stop(ctx, "s"))
	}},
	{"MessagingClient.Sessions.Restart", "POST", "/platform/sessions/s/restart", "", "", `{"success":true,"operationId":"op","message":"Restart accepted"}`, "operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().Restart(ctx, "s"))
	}},
	{"MessagingClient.Sessions.Logout", "POST", "/platform/sessions/s/logout", "", "", `{"success":true,"operationId":"op","message":"Logout accepted"}`, "operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().Logout(ctx, "s"))
	}},
	{"MessagingClient.Sessions.Account", "GET", "/platform/sessions/s/me", "", "", `{"success":true,"data":{"id":"42","pushName":"Support","accountType":"business_app"}}`, "data.accountType", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().Account(ctx, "s"))
	}},
	{"MessagingClient.Sessions.QR", "GET", "/messaging/s/pair/qr", "format=json", "", `{"success":true,"data":{"qr":"display"}}`, "data.qr", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().QR(ctx, "s"))
	}},
	{"MessagingClient.Sessions.RequestPairingCode", "POST", "/messaging/s/pair/code", "", `{"phone":"+15551234567"}`, `{"success":true,"data":{"code":"12345678"}}`, "data.code", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().RequestPairingCode(ctx, "s", PairingCodeRequest{Phone: "+15551234567"}))
	}},
	{"MessagingClient.QuickLinks.Create", "POST", "/messaging/quicklinks", "", `{"projectId":"p","configuration":{"allowPhoneChange":false}}`, `{"success":true,"data":{"id":"ql","url":"https://connect.polymorfa.com/ql","session":"s","purpose":"initial","connectionGoal":"single","expiresAt":null}}`, "data.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(m.QuickLinks().Create(ctx, CreateQuickLinkRequest{ProjectID: "p", Configuration: &QuickLinkConfiguration{AllowPhoneChange: &v}}))
	}},
	{"MessagingClient.QuickLinks.Availability", "GET", "/messaging/quicklinks/availability", "projectId=p&session=s", "", `{"success":true,"data":{"allowed":true,"addConnection":"official_api","connections":[],"resumeQuickLinkId":null}}`, "data.allowed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.QuickLinks().Availability(ctx, "p", "s"))
	}},
	{"MessagingClient.QuickLinks.Retrieve", "GET", "/messaging/quicklinks/x", "", "", `{"success":true,"data":{"id":"x","status":"connected","session":"s"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.QuickLinks().Retrieve(ctx, "x"))
	}},
	{"MessagingClient.QuickLinks.Cancel", "DELETE", "/messaging/quicklinks/x", "", "", `{"success":true,"message":"Cancelled"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.QuickLinks().Cancel(ctx, "x"))
	}},
	{"MessagingClient.Messages.Send", "POST", "/messaging/s/messages/send", "", `{"conversation":{"id":"42"},"content":{"text":"Hello"}}`, `{"success":true,"data":{"id":"message","whatsapp_ids":{"linked_devices":"provider-id"},"conversation":{"id":"42"},"timestamp":"2026-10-11","status":"sent","type":"text"}}`, "data.whatsapp_ids.linked_devices", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		text := "Hello"
		return wireData(m.Messages().Send(ctx, "s", SendMessageRequest{Conversation: ConversationReference{ID: "42"}, Content: MessageContent{Text: &text}}))
	}},
	{"MessagingClient.Messages.OperationStatus", "GET", "/messaging/s/operations/x", "", "", `{"success":true,"data":{"operationId":"x","status":"completed","receipt":{"whatsapp_ids":{"official_api":"provider-id"},"timestamp":"2026-10-11"}}}`, "data.receipt.whatsapp_ids.official_api", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Messages().OperationStatus(ctx, "s", "x"))
	}},
	{"MessagingClient.Messages.MarkSeen", "POST", "/messaging/s/messages/seen", "", `{"conversation":{"id":"42"},"id":"x"}`, `{"success":true,"data":{"status":"OK"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Messages().MarkSeen(ctx, "s", SeenRequest{Conversation: ConversationReference{ID: "42"}, ID: "x"}))
	}},
	{"MessagingClient.Messages.SetTyping", "POST", "/messaging/s/messages/typing", "", `{"conversation":{"id":"42"},"state":"paused"}`, `{"success":true,"data":{"status":"OK"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Messages().SetTyping(ctx, "s", TypingRequest{Conversation: ConversationReference{ID: "42"}, State: "paused"}))
	}},
	{"MessagingClient.Messages.React", "POST", "/messaging/s/messages/react", "", `{"conversation":{"id":"42"},"id":"x","reaction":"👍"}`, `{"success":true,"data":{"id":"x","whatsapp_ids":{"linked_devices":"wa"},"status":"sent"}}`, "data.whatsapp_ids.linked_devices", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Messages().React(ctx, "s", ReactionRequest{Conversation: ConversationReference{ID: "42"}, ID: "x", Reaction: "👍"}))
	}},
	{"MessagingClient.Messages.Star", "POST", "/messaging/s/messages/star", "", `{"conversation":{"id":"42"},"id":"x","star":false}`, `{"success":true,"data":{"status":"OK"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Messages().Star(ctx, "s", StarRequest{Conversation: ConversationReference{ID: "42"}, ID: "x"}))
	}},
	{"MessagingClient.ClientTokens.Mint", "POST", "/platform/client-tokens", "", `{"ephemeralId":"user","customer":"customer","allow":["send_message"]}`, `{"success":true,"data":{"token":"pmfa_ct_example","expiresAt":"2026-10-11"}}`, "data.token", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.ClientTokens().Mint(ctx, MintClientTokenRequest{EphemeralID: "user", Customer: "customer", Allow: []string{"send_message"}}))
	}},
	{"MessagingClient.ClientTokens.RetrieveRules", "GET", "/platform/sessions/s/client-rules", "", "", `{"success":true,"data":{"recipientMode":"conversation","allowedActions":"send_message","rateLimit":0,"maxDaily":0,"allowedOrigins":"https://app.example.com"}}`, "data.recipientMode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.ClientTokens().RetrieveRules(ctx, "s"))
	}},
	{"MessagingClient.ClientTokens.UpdateRules", "PUT", "/platform/sessions/s/client-rules", "", `{"rateLimit":0}`, `{"success":true,"message":"Updated"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := 0
		return wireData(m.ClientTokens().UpdateRules(ctx, "s", SetClientRulesRequest{RateLimit: &v}))
	}},
	{"MessagingClient.ClientTokens.DeleteRules", "DELETE", "/platform/sessions/s/client-rules", "", "", `{"success":true,"message":"Deleted"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.ClientTokens().DeleteRules(ctx, "s"))
	}},
	{"OrganizationClient.Projects.List", "GET", "/platform/projects", "", "", `{"data":[{"_id":"p","name":"Project","totalSessions":2}]}`, "data.0.totalSessions", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().List(ctx))
	}},
	{"OrganizationClient.Projects.Create", "POST", "/platform/projects", "", `{"name":"Project","defaultTier":"standard"}`, `{"data":{"id":"p","name":"Project","stage":"development","defaultTier":"standard"}}`, "data.stage", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().Create(ctx, CreateProjectRequest{Name: "Project", DefaultTier: "standard"}))
	}},
	{"OrganizationClient.Projects.RequestProductionEnrollment", "POST", "/platform/projects/p/promote", "", `{"business":{"name":"Business","website":"https://example.com","supportEmail":"support@example.com"}}`, `{"data":{"id":"p","operationId":"op","billingMode":"payg","stage":"development","enrollmentStatus":"requested"}}`, "data.billingMode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().RequestProductionEnrollment(ctx, "p", ProductionEnrollmentRequest{Business: ProductionBusiness{"Business", "https://example.com", "support@example.com"}}))
	}},
	{"OrganizationClient.Projects.ApproveProductionEnrollment", "POST", "/platform/projects/p/production-enrollments/x/approve", "", "", `{"data":{"operationId":"x","action":"approve","accepted":true}}`, "data.action", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().ApproveProductionEnrollment(ctx, "p", "x"))
	}},
	{"OrganizationClient.Projects.CancelProductionEnrollment", "POST", "/platform/projects/p/production-enrollments/x/cancel", "", "", `{"data":{"operationId":"x","action":"cancel","accepted":true}}`, "data.action", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Projects().CancelProductionEnrollment(ctx, "p", "x"))
	}},
	{"MessagingClient.Media.Retrieve", "GET", "/messaging/media/x/info", "", "", `{"success":true,"data":{"id":"x","session":"s","messageId":"message","mimeType":"image/png","fileLength":64,"persisted":true}}`, "data.mimeType", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Media().Retrieve(ctx, "x"))
	}},
	{"MessagingClient.Media.Persist", "POST", "/messaging/media/x/download-and-save", "", "", `{"success":true,"message":"Saved"}`, "message", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Media().Persist(ctx, "x"))
	}},
}

func TestOperationWireFixtures(t *testing.T) {
	for _, f := range allOperationFixtures() {
		t.Run(f.SDKMethod, func(t *testing.T) {
			count := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				count++
				if r.Method != f.Method || r.URL.EscapedPath() != f.Path || r.URL.RawQuery != f.Query {
					t.Errorf("request %s %s?%s", r.Method, r.URL.EscapedPath(), r.URL.RawQuery)
				}
				if r.Header.Get("Authorization") != "Bearer "+orgConfig("").Credential.Value || r.Header.Get("Polymorfa-Version") != APIVersion {
					t.Error("credential/version headers")
				}
				body, err := io.ReadAll(r.Body)
				if err != nil {
					t.Fatal(err)
				}
				if f.Body == "" {
					if len(body) > 0 {
						t.Errorf("unexpected body %s", body)
					}
				} else {
					var want, got any
					if json.Unmarshal([]byte(f.Body), &want) != nil || json.Unmarshal(body, &got) != nil || !reflect.DeepEqual(got, want) {
						t.Errorf("body got %s want %s", body, f.Body)
					}
				}
				if strings.Contains(f.SDKMethod, "Messages.Send") || strings.Contains(f.SDKMethod, "Messages.React") || strings.Contains(f.SDKMethod, "Channels.ReactToMessage") {
					if r.Header.Get("Idempotency-Key") == "" {
						t.Error("missing automatic idempotency")
					}
				}
				w.Header().Set("Content-Type", "application/json")
				w.Header().Set("X-Request-Id", "fixture")
				io.WriteString(w, f.Response)
			}))
			defer s.Close()
			m := mustMessaging(t, s.URL)
			org, err := NewOrganizationClient(orgConfig(s.URL))
			if err != nil {
				t.Fatal(err)
			}
			project, err := org.Project("p")
			if err != nil {
				t.Fatal(err)
			}
			value, err := f.Call(context.Background(), m, org, project)
			if err != nil {
				t.Fatal(err)
			}
			if count != 1 {
				t.Fatal(count)
			}
			bytes, err := json.Marshal(value)
			if err != nil {
				t.Fatal(err)
			}
			var actual, expected any
			json.Unmarshal(bytes, &actual)
			json.Unmarshal([]byte(f.Response), &expected)
			want := jsonField(expected, f.Check)
			if want == nil {
				if envelope, ok := expected.(map[string]any); ok {
					want = jsonField(envelope["data"], f.Check)
				}
			}
			got := jsonField(actual, f.Check)
			if want == nil || !reflect.DeepEqual(want, got) {
				t.Errorf("typed response %s: got %#v want %#v (%s)", f.Check, got, want, bytes)
			}
		})
	}
}
func allOperationFixtures() []operationFixture {
	all := append([]operationFixture{}, operationFixtures...)
	for _, group := range [][]operationFixture{voipFixtures, developerFixtures, observationFixtures, accountFixtures, groupFixtures, contactFixtures, channelFixtures, platformSessionFixtures, streamAckFixtures, settingsFixtures, officialGroupFixtures, cloudTemplateFixtures, sipFixtures, functionFixtures, businessFixtures, messagingWebhookFixtures, chatPresencePrivacyFixtures, collectionFixtures, cloudAudienceFixtures, securityOptOutFixtures, billingFixtures, customerFixtures, projectHealthFixtures, flowFixtures, voiceFixtures} {
		all = append(all, group...)
	}
	return all
}
func jsonField(value any, path string) any {
	for _, field := range strings.Split(path, ".") {
		if m, ok := value.(map[string]any); ok {
			value = m[field]
			continue
		}
		if a, ok := value.([]any); ok && field == "0" && len(a) > 0 {
			value = a[0]
			continue
		}
		return nil
	}
	return value
}
