package polymorfa

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"net/http/httptest"
	"testing"
)

const campaignFixture = `{"data":{"id":"campaign","name":"Campaign","status":"draft","templateId":null,"recipientListId":null,"recipientCount":2,"sentCount":1,"deliveredCount":1,"readCount":0,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":null,"completedAt":null,"createdAt":123,"updatedAt":123,"sendWindow":null,"extraField":{"future":true}}}`
const campaignOperationFixture = `{"data":{"id":"campaign","name":"Campaign","status":"running","templateId":null,"recipientListId":null,"recipientCount":2,"sentCount":1,"deliveredCount":1,"readCount":0,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":123,"completedAt":null,"createdAt":123,"updatedAt":123,"sendWindow":null,"operationId":"operation"}}`
const campaignAnalyticsFixture = `{"data":{"campaignId":"campaign","recipientCount":2,"sentCount":1,"deliveredCount":1,"readCount":0,"failedCount":0,"skippedCount":0,"respondedCount":1,"responseRate":0.5,"experiment":{"criterion":"reply","outcome":{"state":"inconclusive","reason":"insufficient_evidence"},"holdoutCount":1,"reserveCount":2,"variants":[{"key":"a","label":"A","weight":50,"assigned":1,"sent":1,"delivered":1,"read":0,"replied":1,"outcomeRate":1}]},"averageResponseTimeMs":123,"minResponseTimeMs":100,"maxResponseTimeMs":200}}`
const campaignRecipientsFixture = `{"data":[{"id":"recipient","phone":"+15551234567","variables":{"name":"Alice"},"variantKey":"a","status":"delivered","attempts":1,"lastError":null,"externalMessageId":"provider","queuedAt":123,"sentAt":123,"deliveredAt":124,"readAt":null,"failedAt":null,"respondedAt":null}],"page":{"nextCursor":"next","hasMore":true}}`
const campaignAppendFixture = `{"data":{"campaignId":"campaign","added":1,"recipientCount":3,"duplicateCount":0,"invalidCount":1,"invalidRows":[{"row":2,"reason":"invalid_phone"}]}}`

var campaignFixtures = []operationFixture{
	{"MessagingClient.Campaigns.List", "GET", "/messaging/projects/project/campaigns", "", "", `{"data":[{"id":"campaign","name":"Campaign","status":"draft","templateId":null,"recipientListId":null,"recipientCount":2,"sentCount":1,"deliveredCount":1,"readCount":0,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":null,"completedAt":null,"createdAt":123,"updatedAt":123,"sendWindow":null}]}`, "data.0.sentCount", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().List(ctx, "project"))
	}},
	{"MessagingClient.Campaigns.Create", "POST", "/messaging/projects/project/campaigns", "", `{"name":"Campaign","sendWindow":null,"recipients":[{"phone":"+15551234567"}]}`, campaignFixture, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().Create(ctx, "project", CreateCampaignRequest{Name: "Campaign", SendWindow: &Nullable[CampaignSendWindowRequest]{}, Recipients: []CampaignRecipientInput{{Phone: "+15551234567"}}}))
	}},
	{"MessagingClient.Campaigns.Retrieve", "GET", "/messaging/projects/project/campaigns/campaign", "", "", campaignFixture, "data.recipientCount", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().Retrieve(ctx, "project", "campaign"))
	}},
	{"MessagingClient.Campaigns.Analytics", "GET", "/messaging/projects/project/campaigns/campaign/analytics", "", "", campaignAnalyticsFixture, "data.experiment.outcome.reason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().Analytics(ctx, "project", "campaign"))
	}},
	{"MessagingClient.Campaigns.Launch", "POST", "/messaging/projects/project/campaigns/campaign/launch", "", `{}`, campaignOperationFixture, "data.operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().Launch(ctx, "project", "campaign", LaunchCampaignRequest{}))
	}},
	{"MessagingClient.Campaigns.Pause", "POST", "/messaging/projects/project/campaigns/campaign/pause", "", "", campaignOperationFixture, "data.operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().Pause(ctx, "project", "campaign"))
	}},
	{"MessagingClient.Campaigns.Resume", "POST", "/messaging/projects/project/campaigns/campaign/resume", "", "", campaignOperationFixture, "data.operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().Resume(ctx, "project", "campaign"))
	}},
	{"MessagingClient.Campaigns.Stop", "POST", "/messaging/projects/project/campaigns/campaign/stop", "", "", `{"data":{"id":"campaign","name":"Campaign","status":"cancelled","recipientCount":2,"createdAt":123,"updatedAt":123,"operationId":null}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().Stop(ctx, "project", "campaign"))
	}},
	{"MessagingClient.Campaigns.ListRecipients", "GET", "/messaging/projects/project/campaigns/campaign/recipients", "limit=2&status=delivered", "", campaignRecipientsFixture, "data.0.deliveredAt", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().ListRecipients(ctx, "project", "campaign", ListCampaignRecipientsParams{ListParams: ListParams{Limit: 2}, Status: "delivered"}))
	}},
	{"MessagingClient.Campaigns.AddRecipients", "POST", "/messaging/projects/project/campaigns/campaign/recipients", "", `{"recipients":[{"phone":"+15551234567"}]}`, campaignAppendFixture, "data.invalidRows.0.reason", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(m.Campaigns().AddRecipients(ctx, "project", "campaign", AddCampaignRecipientsRequest{Recipients: []CampaignRecipientInput{{Phone: "+15551234567"}}}))
	}},
	{"MessagingClient.Campaigns.Requeue", "POST", "/messaging/projects/project/campaigns/campaign/requeue", "", `{"includeSkippedError":false}`, `{"data":{"requeued":2}}`, "data.requeued", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		v := false
		return wireData(m.Campaigns().Requeue(ctx, "project", "campaign", RequeueCampaignRequest{IncludeSkippedError: &v}))
	}},
	{"OrganizationClient.Campaigns.List", "GET", "/platform/campaigns", "projectId=p&projectSlug=project", "", `{"data":[{"id":"campaign","name":"Campaign","status":"draft","templateId":null,"recipientListId":null,"recipientCount":2,"sentCount":0,"deliveredCount":0,"readCount":0,"failedCount":0,"skippedCount":0,"scheduledAt":null,"launchedAt":null,"completedAt":null,"createdAt":123,"updatedAt":123,"sendWindow":null,"extraField":"future"}]}`, "data.0.extraField", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().List(ctx, ListCampaignsParams{ProjectID: "p", ProjectSlug: "project"}))
	}},
	{"OrganizationClient.Campaigns.Create", "POST", "/platform/campaigns", "", `{"projectId":"p","name":"Campaign","composerBlueprint":{"version":2,"source":"Hello"}}`, campaignFixture, "data.extraField.future", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Create(ctx, CreatePlatformCampaignRequest{ProjectID: "p", Name: "Campaign", ComposerBlueprint: json.RawMessage(`{"version":2,"source":"Hello"}`)}))
	}},
	{"OrganizationClient.Campaigns.Retrieve", "GET", "/platform/campaigns/campaign", "projectId=p", "", campaignFixture, "data.extraField.future", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Retrieve(ctx, "campaign", PlatformCampaignParams{ProjectID: "p"}))
	}},
	{"OrganizationClient.Campaigns.Update", "PATCH", "/platform/campaigns/campaign", "projectId=p", `{"recipientListId":null,"customField":true}`, campaignFixture, "data.name", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Update(ctx, "campaign", &UpdatePlatformCampaignRequest{UpdateCampaignRequest: UpdateCampaignRequest{RecipientListID: &Nullable[string]{}}, Extra: PlatformPayload{"customField": json.RawMessage(`true`)}}, PlatformCampaignParams{ProjectID: "p"}))
	}},
	{"OrganizationClient.Campaigns.Delete", "DELETE", "/platform/campaigns/campaign", "projectId=p", "", `{"data":{"deleted":true}}`, "data.deleted", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Delete(ctx, "campaign", PlatformCampaignParams{ProjectID: "p"}))
	}},
	{"OrganizationClient.Campaigns.Launch", "POST", "/platform/campaigns/campaign/launch", "", `{"projectId":"p"}`, `{"data":{"operationId":"operation"}}`, "data.operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Launch(ctx, "campaign", PlatformPayload{"projectId": json.RawMessage(`"p"`)}))
	}},
	{"OrganizationClient.Campaigns.Pause", "POST", "/platform/campaigns/campaign/pause", "", "", `{"data":{"operationId":"operation"}}`, "data.operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Pause(ctx, "campaign", nil))
	}},
	{"OrganizationClient.Campaigns.Resume", "POST", "/platform/campaigns/campaign/resume", "", "", `{"data":{"operationId":"operation"}}`, "data.operationId", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Resume(ctx, "campaign", nil))
	}},
	{"OrganizationClient.Campaigns.Stop", "POST", "/platform/campaigns/campaign/stop", "", "", `{"data":{"operationId":null,"status":"cancelled"}}`, "data.status", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Stop(ctx, "campaign", nil))
	}},
	{"OrganizationClient.Campaigns.Archive", "POST", "/platform/campaigns/campaign/archive", "", "", `{"data":{"archived":true}}`, "data.archived", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Archive(ctx, "campaign", nil))
	}},
	{"OrganizationClient.Campaigns.Duplicate", "POST", "/platform/campaigns/campaign/duplicate", "", "", `{"data":{"id":"copy"}}`, "data.id", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Duplicate(ctx, "campaign", nil))
	}},
	{"OrganizationClient.Campaigns.Requeue", "POST", "/platform/campaigns/campaign/requeue", "", "", `{"data":{"requeued":2}}`, "data.requeued", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Requeue(ctx, "campaign", nil))
	}},
	{"OrganizationClient.Campaigns.Analytics", "GET", "/platform/campaigns/campaign/analytics", "projectId=p", "", campaignAnalyticsFixture, "data.averageResponseTimeMs", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Analytics(ctx, "campaign", PlatformCampaignParams{ProjectID: "p"}))
	}},
	{"OrganizationClient.Campaigns.Events", "GET", "/platform/campaigns/campaign/events", "projectId=p", "", `{"data":{"events":[{"type":"started"}]}}`, "data.events.0.type", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Events(ctx, "campaign", PlatformCampaignParams{ProjectID: "p"}))
	}},
	{"OrganizationClient.Campaigns.Recipients", "GET", "/platform/campaigns/campaign/recipients", "limit=2&projectId=p&status=delivered", "", campaignRecipientsFixture, "data.0.variantKey", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Recipients(ctx, "campaign", ListPlatformCampaignRecipientsParams{ListCampaignRecipientsParams: ListCampaignRecipientsParams{ListParams: ListParams{Limit: 2}, Status: "delivered"}, ProjectID: "p"}))
	}},
	{"OrganizationClient.Campaigns.AddRecipients", "POST", "/platform/campaigns/campaign/recipients", "", `{"projectId":"p","recipients":[{"phone":"+15551234567"}]}`, campaignAppendFixture, "data.added", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().AddRecipients(ctx, "campaign", AddPlatformCampaignRecipientsRequest{ProjectID: "p", Recipients: []CampaignRecipientInput{{Phone: "+15551234567"}}}))
	}},
	{"OrganizationClient.Campaigns.RecordConversion", "POST", "/platform/campaigns/campaign/conversions", "", `{"projectId":"p","recipientId":"recipient","eventId":"order","eventType":"purchase","occurredAt":"today","value":{"amountMinor":123,"currency":"USD"}}`, `{"data":{"id":"conversion","campaignId":"campaign","recipientId":"recipient","eventType":"purchase","occurredAt":"today","value":{"amountMinor":123,"currency":"USD"},"evidence":"customer_reported","attribution":{"outcome":"attributed","touchAt":"yesterday","windowDays":7},"recordedAt":"today","replayed":true}}`, "data.attribution.outcome", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		value := CampaignConversionValue{AmountMinor: 123, Currency: "USD"}
		return wireData(o.Campaigns().RecordConversion(ctx, "campaign", RecordCampaignConversionRequest{ProjectID: "p", RecipientID: "recipient", EventID: "order", EventType: "purchase", OccurredAt: "today", Value: &Nullable[CampaignConversionValue]{Value: &value}}))
	}},
	{"OrganizationClient.Campaigns.Conversions", "GET", "/platform/campaigns/campaign/conversions", "projectId=p", "", `{"data":{"campaignId":"campaign","model":{"touch":"recipient_sent","windowDays":7,"correlation":"explicit_recipient"},"sentCount":1,"conversions":{"total":1,"attributed":1,"outsideWindow":0,"notSent":0,"optedOut":0},"convertedRecipients":1,"conversionRate":1,"values":[{"currency":"USD","evidence":"customer_reported","attributedConversions":1,"attributedAmountMinor":"123","unattributedConversions":0,"unattributedAmountMinor":"0"}]}}`, "data.values.0.attributedAmountMinor", func(ctx context.Context, m *MessagingClient, o *OrganizationClient, p *ProjectClient) (any, error) {
		return wireData(o.Campaigns().Conversions(ctx, "campaign", PlatformCampaignParams{ProjectID: "p"}))
	}},
}

func TestCampaignAndTemplateWriteRetryBoundaries(t *testing.T) {
	for _, kind := range []string{"create", "append", "submit", "launch"} {
		t.Run(kind, func(t *testing.T) {
			count := 0
			key := ""
			s := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
				count++
				if count == 1 {
					key = r.Header.Get("Idempotency-Key")
				}
				if kind == "launch" && (key == "" || key != r.Header.Get("Idempotency-Key")) {
					t.Error("Lifecycle identity changed")
				}
				w.Header().Set("Content-Type", "application/json")
				if kind == "launch" && count == 2 {
					io.WriteString(w, campaignOperationFixture)
					return
				}
				w.WriteHeader(503)
				io.WriteString(w, `{"error":{"message":"Down"}}`)
			}))
			defer s.Close()
			o, _ := NewOrganizationClient(orgConfig(s.URL))
			m, _ := NewMessagingClient(orgConfig(s.URL))
			opts := RequestOptions{IdempotencyKey: "caller-key"}
			var err error
			switch kind {
			case "create":
				_, err = o.Campaigns().Create(context.Background(), CreatePlatformCampaignRequest{ProjectID: "p", Name: "Campaign"}, opts)
				if key != "" {
					t.Error("Creation uses caller idempotency identity")
				}
			case "append":
				_, err = m.Campaigns().AddRecipients(context.Background(), "p", "campaign", AddCampaignRecipientsRequest{Recipients: []CampaignRecipientInput{}}, opts)
			case "submit":
				_, err = m.Templates().Submit(context.Background(), "p", "template", SubmitProjectTemplateRequest{Session: "s"}, opts)
			case "launch":
				_, err = m.Campaigns().Launch(context.Background(), "p", "campaign", LaunchCampaignRequest{})
			}
			expected := 1
			if kind == "launch" {
				expected = 2
				if err != nil {
					t.Fatal(err)
				}
			} else if err == nil {
				t.Error("Lost503 error")
			}
			if count != expected {
				t.Fatal(count, expected)
			}
		})
	}
}
