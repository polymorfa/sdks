package polymorfa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

var cloudAudienceFixtures = []operationFixture{
	{"MessagingClient.Sessions.GetMetaPricing", "GET", "/messaging/s/meta-pricing", "since=yesterday&until=today", "", `{"data":{"source":"meta","since":"yesterday","until":"today","messages":2,"groups":[{"category":"utility","pricingModel":"PMP","pricingType":null,"billable":false,"messages":2}]}}`, "data.groups.0.billable", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().GetMetaPricing(ctx, "s", MetaPricingParams{Since: "yesterday", Until: "today"}))
	}},
	{"MessagingClient.Sessions.GetCloudCredentialHealth", "GET", "/messaging/s/cloud-credentials", "", "", `{"data":{"status":"action_required","checkedAt":"today","nextCheckAt":null,"token":{"status":"expired","expiresAt":"yesterday"},"missingPermissions":[],"phoneRegistration":"registered","webhookSubscription":"subscribed","failureCode":"token_expired"}}`, "data.failureCode", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().GetCloudCredentialHealth(ctx, "s"))
	}},
	{"MessagingClient.Sessions.ReauthorizeCloudCredentials", "POST", "/messaging/s/cloud-credentials/reauthorize", "", "", `{"data":{"quicklinkId":"link","url":"https://connect.example/link","session":"s"}}`, "data.quicklinkId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Sessions().ReauthorizeCloudCredentials(ctx, "s"))
	}},
	{"MessagingClient.CloudOnboarding.Advance", "POST", "/messaging/cloud-api/embedded-signup", "", `{"quicklinkId":"link","projectId":"p","result":{"code":"fixture-code","wabaId":"waba","phoneNumberId":"phone","coexistence":false}}`, `{"success":true,"data":{"stage":"connecting"}}`, "data.stage", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(m.CloudOnboarding().Advance(ctx, EmbeddedSignupRequest{QuickLinkID: "link", ProjectID: "p", Result: &EmbeddedSignupResult{Code: "fixture-code", WABAID: "waba", PhoneNumberID: "phone", Coexistence: &v}}))
	}},
	{"MessagingClient.Testing.CreateHistoryFixture", "POST", "/messaging/testing/p/history-fixtures", "", `{"messages":[{"id":"message","senderPhone":"+15551234567","text":"Hello","timestamp":123,"fromMe":false}]}`, `{"fixtureId":"fixture"}`, "fixtureId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Testing().CreateHistoryFixture(ctx, "p", []TestingHistoryMessage{{ID: "message", SenderPhone: "+15551234567", Text: "Hello", Timestamp: 123}}))
	}},
	{"MessagingClient.Testing.TriggerEvent", "POST", "/messaging/testing/p/events", "", `{"session":"s","event":"message.received","overrides":{"text":"Hello"}}`, `{"event":"message.received","session":"s","delivery":"queued","eventId":"event","source":"test"}`, "eventId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Testing().TriggerEvent(ctx, "p", TriggerTestEventRequest{Session: "s", Event: "message.received", Overrides: &TestEventOverrides{Text: "Hello"}}))
	}},
	{"MessagingClient.Testing.ListEventFixtures", "GET", "/messaging/testing/p/events/fixtures", "", "", `{"fixtures":[{"name":"message.received","description":"Incoming","overrides":["text"]}]}`, "fixtures.0.description", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Testing().ListEventFixtures(ctx, "p"))
	}},
	{"OrganizationClient.Audiences.List", "GET", "/platform/audiences", "", "", `{"data":{"audiences":[{"id":"audience"}]}}`, "data.audiences.0.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Audiences().List(ctx))
	}},
	{"OrganizationClient.Audiences.Retrieve", "GET", "/platform/audiences/audience", "", "", `{"data":{"id":"audience","name":"Audience"}}`, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Audiences().Retrieve(ctx, "audience"))
	}},
	{"OrganizationClient.Audiences.Delete", "DELETE", "/platform/audiences/audience", "", "", `{"data":{"id":"audience","deleted":true}}`, "data.deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Audiences().Delete(ctx, "audience"))
	}},
	{"OrganizationClient.Audiences.CreateUpload", "POST", "/platform/audiences/uploads", "", `{"contentType":"text/csv"}`, `{"data":{"id":"upload","url":"https://storage.example/upload"}}`, "data.url", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Audiences().CreateUpload(ctx, PlatformPayload{"contentType": json.RawMessage(`"text/csv"`)}))
	}},
	{"OrganizationClient.Audiences.Create", "POST", "/platform/audiences", "", `{"name":"Audience","source":"csv","fileId":"upload","mapping":{"phone":"Phone","variables":{"name":"Name"}}}`, `{"data":{"id":"audience","name":"Audience","source":"csv","recipientCount":2,"fileId":"upload","columns":["Phone","Name"],"sampleRow":{"Name":"Alice"},"mapping":{"phone":"Phone"},"createdAt":123,"updatedAt":123,"duplicateCount":1,"invalidCount":1,"invalidRows":[{"row":2,"reason":"invalid_phone"}]}}`, "data.invalidRows.0.reason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Audiences().Create(ctx, CreateAudienceRequest{Name: "Audience", Source: "csv", FileID: "upload", Mapping: &AudienceImportMapping{Phone: "Phone", Variables: map[string]string{"name": "Name"}}}))
	}},
	{"OrganizationClient.Audiences.ListMembers", "GET", "/platform/audiences/audience/members", "cursor=cursor&limit=2", "", `{"data":[{"id":"member","phone":"+15551234567","variables":{"name":"Alice"},"createdAt":123}],"page":{"nextCursor":"next","hasMore":true}}`, "data.0.variables.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Audiences().ListMembers(ctx, "audience", ListParams{Cursor: "cursor", Limit: 2}))
	}},
	{"OrganizationClient.Audiences.AddMembers", "POST", "/platform/audiences/audience/members", "", `{"members":[{"phone":"+15551234567","variables":{"name":"Alice","age":42,"optedIn":false}}]}`, `{"data":{"listId":"audience","added":1,"recipientCount":3,"duplicateCount":0,"invalidCount":0,"invalidRows":[]}}`, "data.added", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		name, age, optedIn := "Alice", 42.0, false
		return wireData(o.Audiences().AddMembers(ctx, "audience", AddAudienceMembersRequest{Members: []CampaignRecipientInput{{Phone: "+15551234567", Variables: map[string]CampaignVariable{"name": {String: &name}, "age": {Number: &age}, "optedIn": {Bool: &optedIn}}}}}))
	}},
	{"OrganizationClient.Audiences.DeleteMember", "DELETE", "/platform/audiences/audience/members/+15551234567", "", "", `{"data":{"removed":true,"listId":"audience","phone":"+15551234567","recipientCount":2}}`, "data.removed", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Audiences().DeleteMember(ctx, "audience", "+15551234567"))
	}},
}

func TestAudienceAppendAndReauthorizationAreSentOnce(t *testing.T) {
	for _, kind := range []string{"append", "reauthorize"} {
		t.Run(kind, func(t *testing.T) {
			count := 0
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				count++
				w.Header().Set("Content-Type", "application/json")
				w.WriteHeader(503)
				io.WriteString(w, `{"error":{"message":"Down"}}`)
			}))
			defer s.Close()
			cfg := orgConfig(s.URL)
			retries := 3
			cfg.MaxNetworkRetries = &retries
			m, _ := NewMessagingClient(cfg)
			o, _ := NewOrganizationClient(cfg)
			var err error
			if kind == "append" {
				_, err = o.Audiences().AddMembers(context.Background(), "audience", AddAudienceMembersRequest{Members: []CampaignRecipientInput{}}, RequestOptions{IdempotencyKey: "stable"})
			} else {
				_, err = m.Sessions().ReauthorizeCloudCredentials(context.Background(), "s", RequestOptions{IdempotencyKey: "stable"})
			}
			if err == nil || count != 1 {
				t.Fatal(err, count)
			}
		})
	}
}
